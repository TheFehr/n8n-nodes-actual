import { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { getAccounts, getCategoryGroups, getPayees, getTags } from '@actual-app/api';

import { Credentials, withBudgetSession } from '../GenericFunctions';

async function getAuthAndBudget(
	context: ILoadOptionsFunctions,
): Promise<{ auth: Credentials; budgetId: string }> {
	const auth = (await context.getCredentials('actualBudgetApi')) as Credentials;
	const budgetId = context.getNodeParameter('budgetId', 0) as string;
	return { auth, budgetId };
}

function matchesFilter(name: string, filter?: string): boolean {
	if (!filter) return true;
	return name.toLowerCase().includes(filter.toLowerCase());
}

export async function searchAccounts(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { auth, budgetId } = await getAuthAndBudget(this);
	const accounts = await withBudgetSession(auth, budgetId, () => getAccounts());
	return {
		results: accounts
			.filter((account) => matchesFilter(account.name, filter))
			.map((account) => ({ name: account.name, value: account.id })),
	};
}

export async function searchPayees(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { auth, budgetId } = await getAuthAndBudget(this);
	const payees = await withBudgetSession(auth, budgetId, () => getPayees());
	return {
		results: payees
			.filter((payee) => matchesFilter(payee.name, filter))
			.map((payee) => ({ name: payee.name, value: payee.id })),
	};
}

// Categories are searched via their owning group (getCategoryGroups' nested shape) rather
// than getCategories(), which can return a mix of category and category-group entities in
// one flat array depending on the budget's structure.
export async function searchCategories(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { auth, budgetId } = await getAuthAndBudget(this);
	const groups = await withBudgetSession(auth, budgetId, () => getCategoryGroups());
	const results = groups.flatMap((group) =>
		(group.categories ?? []).map((category) => ({
			name: `${group.name} / ${category.name}`,
			value: category.id,
		})),
	);
	return { results: results.filter((result) => matchesFilter(result.name, filter)) };
}

export async function searchCategoryGroups(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { auth, budgetId } = await getAuthAndBudget(this);
	const groups = await withBudgetSession(auth, budgetId, () => getCategoryGroups());
	return {
		results: groups
			.filter((group) => matchesFilter(group.name, filter))
			.map((group) => ({ name: group.name, value: group.id })),
	};
}

export async function searchTags(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { auth, budgetId } = await getAuthAndBudget(this);
	const tags = await withBudgetSession(auth, budgetId, () => getTags());
	return {
		results: tags
			.filter((tag) => matchesFilter(tag.tag, filter))
			.map((tag) => ({ name: tag.tag, value: tag.id })),
	};
}
