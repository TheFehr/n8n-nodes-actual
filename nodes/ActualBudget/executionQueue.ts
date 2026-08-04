// @actual-app/api stores its session (DB connection, sync clock) in a module-level
// singleton shared by every execution of every node version in this process. Running two
// executions concurrently - even a V1 execution and a V2 execution, since they're
// separate classes but the same underlying API module - lets one's init()/shutdown() tear
// down state the other is mid-operation on. Every execution, regardless of version, is
// funneled through this single shared queue to run one at a time.
let executionQueue: Promise<unknown> = Promise.resolve();

export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
	const result = executionQueue.then(fn, fn);
	executionQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}
