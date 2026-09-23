// Both screens and their background hooks share one physical register per device.
const queues = new Map<string, Promise<unknown>>()

export function runScheduleCommand<T>(deviceId: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(deviceId) ?? Promise.resolve()
  const result = previous.catch(() => {}).then(action)
  queues.set(deviceId, result)
  const cleanup = () => { if (queues.get(deviceId) === result) queues.delete(deviceId) }
  void result.then(cleanup, cleanup)
  return result
}
