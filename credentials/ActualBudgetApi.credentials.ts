import { IconFile, ICredentialTestRequest, ICredentialType, INodeProperties } from "n8n-workflow";

export class ActualBudgetApi implements ICredentialType {
  name = "actualBudgetApi";
  displayName = "Actual Budget API";
  documentationUrl = "https://actualbudget.org/docs/api/";
  properties: INodeProperties[] = [
    {
      displayName: "URL",
      name: "url",
      type: "string",
      default: "",
      required: true,
    },
    {
      displayName: "Password",
      name: "password",
      type: "string",
      typeOptions: {
        password: true,
      },
      default: "",
      required: true,
    },
    {
      displayName: "Budget ID",
      name: "budgetId",
      type: "string",
      default: "",
      placeholder: "e.g. 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      description:
        "The budget (sync ID, found in Actual under Settings > Show advanced settings) this credential works with. Used by node version 3 and later, which has no Budget ID field of its own: create one credential per budget. Older node versions ignore this and use the Budget ID set on the node.",
    },
    {
      displayName: "End-to-End Encryption Password",
      name: "encryptionPassword",
      type: "string",
      typeOptions: {
        password: true,
      },
      default: "",
      description:
        'Only needed if your budget uses end-to-end encryption (the "File is encrypted. Please provide a password" error). This is the encryption password set for the budget, not the server password. Leave empty for unencrypted budgets. Belongs to the budget of this credential. Older node versions apply it to whichever budget the node names.',
    },
  ];

  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials?.url}}",
      url: "=/account/login",
      method: "POST",
      body: {
        loginMethod: "password",
        password: "={{$credentials?.password}}",
      },
    },
  };

  icon = "file:../nodes/ActualBudget/actualbudget.svg" as IconFile;
}
