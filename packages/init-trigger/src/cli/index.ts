import { Command } from "commander";
import inquirer from "inquirer";
import { COMMAND_NAME, DEFAULT_TRIGGER_URL } from "../consts.js";
import { getVersion } from "../utils/getVersion.js";
import { logger } from "../utils/logger.js";

export interface CliFlags {
  projectPath: string;
  triggerUrl: string;
  endpointUrl: string;
  endpointSlug: string;
  apiKey?: string;
}

export interface CliResults {
  flags: CliFlags;
}

const defaultOptions: CliResults = {
  flags: {
    projectPath: ".",
    triggerUrl: DEFAULT_TRIGGER_URL,
    endpointUrl: "http://localhost:3000",
    endpointSlug: "my-nextjs-project",
  },
};

export const parseCliOptions = async () => {
  const cliResults = defaultOptions;

  const program = new Command().name(COMMAND_NAME);

  program
    .description("A CLI for initializing Trigger.dev in your Next.js")
    .option(
      "-p, --project-path <project-path>",
      "The path to the Next.js project",
      "."
    )
    .option(
      "-k, --api-key <api-key>",
      "The development API key to use for the project."
    )
    .option(
      "-e, --endpoint-slug <endpoint-slug>",
      "The unique slug for the endpoint to use for this project. (e.g. my-nextjs-project)",
      "my-nextjs-project"
    )
    .option(
      "-u, --endpoint-url <endpoint-url>",
      "The URL of your local Next.js project. (e.g. http://localhost:3000). NOTE: Must be a publicly accessible URL if you are using a deployed Trigger.dev instance"
    )
    .option(
      "-t, --trigger-url <trigger-url>",
      "The URL of the Trigger.dev instance to use. (e.g. https://cloud.trigger.dev)"
    )
    .version(getVersion(), "-v, --version", "Display the version number")
    .parse(process.argv);

  cliResults.flags = program.opts();

  return cliResults;
};

export const runCliPrompts = async (cliResults: CliResults) => {
  try {
    if (!cliResults.flags.triggerUrl) {
      cliResults.flags.triggerUrl = await promptTriggerUrl();
    }

    if (!cliResults.flags.apiKey) {
      cliResults.flags.apiKey = await promptApiKey(cliResults.flags.triggerUrl);
    }

    if (!cliResults.flags.endpointSlug) {
      cliResults.flags.endpointSlug = await promptEndpointSlug();
    }

    if (!cliResults.flags.endpointUrl) {
      cliResults.flags.endpointUrl = await promptEndpointUrl(
        cliResults.flags.triggerUrl
      );
    }
  } catch (err) {
    // If the user is not calling the command from an interactive terminal, inquirer will throw an error with isTTYError = true
    // If this happens, we catch the error, tell the user what has happened, and then continue to run the program with a default trigger project
    // Otherwise we have to do some fancy namespace extension logic on the Error type which feels overkill for one line
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (err instanceof Error && (err as any).isTTYError) {
      logger.warn(
        `${COMMAND_NAME} needs an interactive terminal to provide options`
      );

      const { shouldContinue } = await inquirer.prompt<{
        shouldContinue: boolean;
      }>({
        name: "shouldContinue",
        type: "confirm",
        message: `Continue initializing your trigger.dev project?`,
        default: true,
      });

      if (!shouldContinue) {
        logger.info("Exiting...");
        process.exit(0);
      }
    } else {
      throw err;
    }
  }

  return cliResults;
};

const promptTriggerUrl = async (): Promise<string> => {
  const { instanceType } = await inquirer.prompt<{
    instanceType: "cloud" | "self-hosted";
  }>([
    {
      type: "list",
      name: "instanceType",
      message: "Are you using the Trigger.dev cloud or self-hosted?",
      choices: [
        {
          name: "Trigger.dev Cloud",
          value: "cloud",
          default: true,
        },
        {
          name: "Self hosted",
          value: "self-hosted",
        },
      ],
    },
  ]);

  if (instanceType === "cloud") {
    return DEFAULT_TRIGGER_URL;
  }

  const { triggerUrl } = await inquirer.prompt<{ triggerUrl: string }>({
    type: "input",
    name: "triggerUrl",
    message: "Enter the URL of your self-hosted Trigger.dev instance",
    validate: (input) => {
      if (!input) {
        return "Please enter the URL of your self-hosted Trigger.dev instance";
      }

      return true;
    },
  });

  return triggerUrl;
};

const promptApiKey = async (instanceUrl: string): Promise<string> => {
  // First prompt if they want to enter their API key now, and if they say Yes, then prompt for it and return it
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>({
    type: "input",
    name: "apiKey",
    message: `Enter your development API key (Find yours ➡️ ${instanceUrl})`,
    validate: (input) => {
      // Make sure they enter something like tr_dev_********
      if (!input) {
        return "Please enter your development API key";
      }

      if (!input.startsWith("tr_dev_")) {
        return "Please enter a valid development API key or leave blank to skip (should start with tr_dev_)";
      }

      return true;
    },
  });

  return apiKey;
};

const promptEndpointSlug = async (): Promise<string> => {
  const { endpointSlug } = await inquirer.prompt<{
    endpointSlug: string;
  }>({
    type: "input",
    name: "endpointSlug",
    message: "Enter a unique slug for your endpoint (required)",
    validate: (input) => {
      if (!input) {
        return "Please enter a unique slug for your endpoint";
      }

      return true;
    },
  });

  return endpointSlug;
};

const promptEndpointUrl = async (instanceUrl: string): Promise<string> => {
  const { endpointUrl } = await inquirer.prompt<{
    endpointUrl: string;
  }>({
    type: "input",
    name: "endpointUrl",
    message: "What's the URL of your Next.js project?",
    validate: (input) => {
      if (!input) {
        return "Please enter the URL of your Next.js project";
      }

      // If instanceUrl is a cloud instance, then the URL must be publicly accessible
      const url = new URL(input);
      const triggerUrl = new URL(instanceUrl);

      if (triggerUrl.hostname !== "localhost" && url.hostname === "localhost") {
        return `Your Trigger.dev instance is hosted at ${triggerUrl.hostname}, so your Next.js project must also be publicly accessible. See our docs for more info: https://trigger.dev/docs/documentation/guides/tunneling-localhost`;
      }

      // Make sure triggerUrl and url don't use the same port if they are both localhost
      if (
        triggerUrl.hostname === "localhost" &&
        url.hostname === "localhost" &&
        triggerUrl.port === url.port
      ) {
        return `Your Trigger.dev instance and your Next.js project are both trying to use port ${triggerUrl.port}. Please use a different port for one of them`;
      }

      return true;
    },
  });

  return endpointUrl;
};

export const obfuscateApiKey = (apiKey: string) => {
  const [prefix, slug, secretPart] = apiKey.split("_") as [
    string,
    string,
    string
  ];
  return `${prefix}_${slug}_${"*".repeat(secretPart.length)}`;
};
