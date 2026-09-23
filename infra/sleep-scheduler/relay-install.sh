#!/bin/sh
# Run on the existing EC2 host via SSM as root, after candidate tests pass.
# Arguments: full tested git commit, Secrets Manager ARN. Never print the secret.
set -eu
commit=$1
secret_arn=$2
case "$commit" in *[!0-9a-f]*|'') exit 2;; esac
test "${#commit}" -eq 40
case "$secret_arn" in arn:aws:secretsmanager:us-east-1:*:secret:*) ;; *) exit 2;; esac
cd /opt/sierro-relay
test -z "$(git status --porcelain --untracked-files=no)"
previous=$(git rev-parse HEAD)
umask 077
backup=/opt/sierro-relay-backups/sleep-scheduler-$commit
mkdir -p "$backup" /etc/sierro-sleep /etc/systemd/system/sierro-relay.service.d
chmod 700 "$backup" /etc/sierro-sleep
aws secretsmanager get-secret-value --region us-east-1 --secret-id "$secret_arn" --query SecretString --output text > /etc/sierro-sleep/signing-key.next
test "$(wc -c < /etc/sierro-sleep/signing-key.next)" -ge 64
mv /etc/sierro-sleep/signing-key.next /etc/sierro-sleep/signing-key
chmod 600 /etc/sierro-sleep/signing-key
dropin=/etc/systemd/system/sierro-relay.service.d/sleep-scheduler.conf
if test -f "$dropin"; then cp -p "$dropin" "$backup/sleep-scheduler.conf"; fi
systemctl stop sierro-relay
cp -p server/tokens.json "$backup/tokens.json"
chmod 600 "$backup/tokens.json"
rollback() {
  systemctl stop sierro-relay || true
  git checkout --detach "$previous"
  if test -f "$backup/sleep-scheduler.conf"; then cp -p "$backup/sleep-scheduler.conf" "$dropin"; else rm -f "$dropin"; fi
  systemctl daemon-reload
  systemctl start sierro-relay
  echo 'Code rolled back; live token store was NOT replaced.'
}
trap 'rollback' EXIT
git checkout --detach "$commit"
printf '[Service]\nEnvironment=SLEEP_SCHEDULER_EXTERNAL=true\nEnvironment=SLEEP_SCHEDULER_SECRET_FILE=/etc/sierro-sleep/signing-key\n' > "$dropin"
systemctl daemon-reload
systemctl start sierro-relay
sleep 3
systemctl is-active --quiet sierro-relay
curl --fail --silent http://127.0.0.1:8787/health
trap - EXIT
echo
echo "Relay deployed: $commit"
