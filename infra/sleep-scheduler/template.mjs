// Generate a self-contained CloudFormation template from the tested handler.
import { readFileSync, writeFileSync } from 'node:fs'
const ref = name => ({ Ref: name })
const arn = name => ({ 'Fn::GetAtt': [name, 'Arn'] })
const sub = value => ({ 'Fn::Sub': value })
const policy = Statement => ({ Version: '2012-10-17', Statement })
const allow = (Action, Resource) => ({ Effect: 'Allow', Action, Resource })
const trust = Service => policy([{ Effect: 'Allow', Principal: { Service }, Action: 'sts:AssumeRole' }])
const retained = { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' }
const t = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Dedicated Sierro charge-window timer. Device credentials remain on the relay.',
  Parameters: {
    RelayUrl: { Type: 'String', AllowedPattern: 'https://[A-Za-z0-9.-]+', Description: 'HTTPS relay origin, no path or credentials' },
    RelayRoleName: { Type: 'String', AllowedPattern: '[A-Za-z0-9+=,.@_-]+', Description: 'Existing EC2 role allowed to install the signing secret' },
    ScheduleState: { Type: 'String', Default: 'DISABLED', AllowedValues: ['DISABLED', 'ENABLED'] },
  },
  Resources: {
    SigningSecret: { Type: 'AWS::SecretsManager::Secret', ...retained, Properties: {
      Description: 'HMAC key for the sleep timer, not a device credential',
      GenerateSecretString: { PasswordLength: 64, ExcludePunctuation: true },
    } },
    DeadLetters: { Type: 'AWS::SQS::Queue', ...retained, Properties: { SqsManagedSseEnabled: true, MessageRetentionPeriod: 1209600 } },
    Logs: { Type: 'AWS::Logs::LogGroup', ...retained, Properties: {
      LogGroupName: sub('/aws/lambda/${AWS::StackName}-tick'), RetentionInDays: 30,
    } },
    FunctionRole: { Type: 'AWS::IAM::Role', Properties: {
      AssumeRolePolicyDocument: trust('lambda.amazonaws.com'),
      Policies: [{ PolicyName: 'sleep-tick', PolicyDocument: policy([
        allow(['logs:CreateLogStream', 'logs:PutLogEvents'], arn('Logs')),
        allow('secretsmanager:GetSecretValue', ref('SigningSecret')),
        allow('sqs:SendMessage', arn('DeadLetters')),
      ]) }],
    } },
    RelaySecretAccess: { Type: 'AWS::IAM::Policy', Properties: {
      PolicyName: sub('${AWS::StackName}-read-signing-secret'), Roles: [ref('RelayRoleName')],
      PolicyDocument: policy([allow('secretsmanager:GetSecretValue', ref('SigningSecret'))]),
    } },
    TickFunction: { Type: 'AWS::Lambda::Function', Properties: {
      FunctionName: sub('${AWS::StackName}-tick'), Runtime: 'nodejs22.x', Handler: 'index.handler',
      Role: arn('FunctionRole'), Timeout: 55, MemorySize: 128,
      Code: { ZipFile: readFileSync(new URL('./handler.cjs', import.meta.url), 'utf8') },
      Environment: { Variables: { RELAY_URL: ref('RelayUrl'), SECRET_ARN: ref('SigningSecret') } },
      DeadLetterConfig: { TargetArn: arn('DeadLetters') },
      LoggingConfig: { LogGroup: ref('Logs') },
    } },
    AsyncPolicy: { Type: 'AWS::Lambda::EventInvokeConfig', Properties: {
      FunctionName: ref('TickFunction'), Qualifier: '$LATEST', MaximumEventAgeInSeconds: 60, MaximumRetryAttempts: 0,
    } },
    ScheduleGroup: { Type: 'AWS::Scheduler::ScheduleGroup' },
    SchedulerRole: { Type: 'AWS::IAM::Role', Properties: {
      AssumeRolePolicyDocument: policy([{ Effect: 'Allow', Principal: { Service: 'scheduler.amazonaws.com' },
        Action: 'sts:AssumeRole', Condition: { StringEquals: { 'aws:SourceAccount': ref('AWS::AccountId') },
          ArnEquals: { 'aws:SourceArn': arn('ScheduleGroup') } } }]),
      Policies: [{ PolicyName: 'invoke-sleep-timer', PolicyDocument: policy([
        allow('lambda:InvokeFunction', arn('TickFunction')), allow('sqs:SendMessage', arn('DeadLetters')),
      ]) }],
    } },
    MinuteTick: { Type: 'AWS::Scheduler::Schedule', DependsOn: 'AsyncPolicy', Properties: {
      GroupName: ref('ScheduleGroup'), State: ref('ScheduleState'), ScheduleExpression: 'cron(* * * * ? *)',
      ScheduleExpressionTimezone: 'UTC', FlexibleTimeWindow: { Mode: 'OFF' },
      Target: { Arn: arn('TickFunction'), RoleArn: arn('SchedulerRole'), Input: '{}',
        RetryPolicy: { MaximumEventAgeInSeconds: 60, MaximumRetryAttempts: 0 },
        DeadLetterConfig: { Arn: arn('DeadLetters') },
      },
    } },
    TickErrorAlarm: { Type: 'AWS::CloudWatch::Alarm', Properties: {
      AlarmDescription: 'Sleep control failure. Inspect Lambda logs and relay background-session status.',
      Namespace: 'AWS/Lambda', MetricName: 'Errors', Dimensions: [{ Name: 'FunctionName', Value: ref('TickFunction') }],
      Statistic: 'Sum', Period: 60, EvaluationPeriods: 3, DatapointsToAlarm: 2, Threshold: 0,
      ComparisonOperator: 'GreaterThanThreshold', TreatMissingData: 'notBreaching',
    } },
    MissingTickAlarm: { Type: 'AWS::CloudWatch::Alarm', Properties: {
      AlarmDescription: 'No sleep timer invocation in five minutes',
      Namespace: 'AWS/Lambda', MetricName: 'Invocations', Dimensions: [{ Name: 'FunctionName', Value: ref('TickFunction') }],
      Statistic: 'Sum', Period: 300, EvaluationPeriods: 1, Threshold: 1,
      ComparisonOperator: 'LessThanThreshold', TreatMissingData: 'breaching',
    } },
    DeadLetterAlarm: { Type: 'AWS::CloudWatch::Alarm', Properties: {
      AlarmDescription: 'Failed sleep timer deliveries or executions; do not replay old power commands',
      Namespace: 'AWS/SQS', MetricName: 'ApproximateNumberOfMessagesVisible',
      Dimensions: [{ Name: 'QueueName', Value: { 'Fn::GetAtt': ['DeadLetters', 'QueueName'] } }],
      Statistic: 'Maximum', Period: 60, EvaluationPeriods: 1, Threshold: 0,
      ComparisonOperator: 'GreaterThanThreshold', TreatMissingData: 'notBreaching',
    } },
  },
  Outputs: {
    FunctionName: { Description: 'Sleep timer Lambda', Value: ref('TickFunction') },
    SecretArn: { Description: 'Install on relay using its instance role, never print SecretString', Value: ref('SigningSecret') },
    ScheduleName: { Description: 'Minute timer', Value: ref('MinuteTick') },
    ScheduleGroup: { Description: 'Timer group', Value: ref('ScheduleGroup') },
    DeadLetterQueue: { Description: 'Failed invocation queue', Value: ref('DeadLetters') },
  },
}
writeFileSync(new URL('./template.generated.json', import.meta.url), JSON.stringify(t, null, 2) + '\n')
