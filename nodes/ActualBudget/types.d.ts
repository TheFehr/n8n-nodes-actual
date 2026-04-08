// STRATEGY: MANUAL TYPE DECLARATIONS                                                                                                                                                                │
// We are manually declaring the @actual-app/api functions here instead of using                                                                                                                     │
// `import type` from '@actual-app/api'.                                                                                                                                                             │
//                                                                                                                                                                                                   │
// WHY: The @actual-app/api package depends on @actual-app/core, which exports                                                                                                                       │
// its raw TypeScript source. Any attempt to resolve types through the normal                                                                                                                        │
// import system causes the n8n-node compiler to try (and fail) to compile                                                                                                                           │
// those third-party source files.                                                                                                                                                                   │
//                                                                                                                                                                                                   │
// By declaring them globally here, we provide type safety for the `require()`
// used in the node implementation while completely isolating the compiler
// from the broken @actual-app/core type-chain.

interface ActualTransaction {
	date: string;
	amount: number;
	payee?: string;
	payee_name?: string;
	imported_payee?: string;
	category?: string;
	notes?: string;
	cleared?: boolean;
	imported_id?: string;
}

declare function init(config: {
	serverURL: string;
	password?: string;
	budgetId?: string;
	dataDir?: string;
}): Promise<void>;
declare function downloadBudget(budgetId: string, options?: { password?: string }): Promise<void>;
declare function importTransactions(
	accountId: string,
	transactions: ActualTransaction[],
): Promise<string>;
declare function shutdown(): Promise<void>;

