import type { LoaderArgs } from "@remix-run/server-runtime";
import { useState } from "react";
import {
  UseDataFunctionReturn,
  typedjson,
  useTypedLoaderData,
} from "remix-typedjson";
import { LogoIcon } from "~/components/LogoIcon";
import { ConnectToIntegrationSheet } from "~/components/integrations/ConnectToIntegrationSheet";
import { NoIntegrationSheet } from "~/components/integrations/NoIntegrationSheet";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { LinkButton } from "~/components/primitives/Buttons";
import { Callout } from "~/components/primitives/Callout";
import { Header2 } from "~/components/primitives/Headers";
import { Help, HelpContent, HelpTrigger } from "~/components/primitives/Help";
import { Input } from "~/components/primitives/Input";
import { NamedIcon, NamedIconInBox } from "~/components/primitives/NamedIcon";
import {
  PageButtons,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitleRow,
} from "~/components/primitives/PageHeader";
import { Paragraph } from "~/components/primitives/Paragraph";
import { Switch } from "~/components/primitives/Switch";
import {
  Table,
  TableBlankRow,
  TableBody,
  TableCell,
  TableCellChevron,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "~/components/primitives/Table";
import { SimpleTooltip } from "~/components/primitives/Tooltip";
import { useOrganization } from "~/hooks/useOrganizations";
import { useProject } from "~/hooks/useProject";
import { useTextFilter } from "~/hooks/useTextFilter";
import { Organization } from "~/models/organization.server";
import { Project } from "~/models/project.server";
import {
  IntegrationOrApi,
  IntegrationsPresenter,
} from "~/presenters/IntegrationsPresenter.server";
import { requireUser } from "~/services/session.server";
import { formatDateTime } from "~/utils";
import { Handle } from "~/utils/handle";
import {
  ProjectParamSchema,
  docsCreateIntegration,
  docsPath,
  integrationClientPath,
} from "~/utils/pathBuilder";

export const loader = async ({ request, params }: LoaderArgs) => {
  const user = await requireUser(request);
  const { organizationSlug, projectParam } = ProjectParamSchema.parse(params);

  const presenter = new IntegrationsPresenter();
  const data = await presenter.call({
    userId: user.id,
    organizationSlug,
    projectSlug: projectParam,
  });

  return typedjson(data);
};

export const handle: Handle = {
  breadcrumb: {
    slug: "integrations",
  },
};

export default function Integrations() {
  const { clients, options, callbackUrl } = useTypedLoaderData<typeof loader>();
  const organization = useOrganization();
  const project = useProject();

  return (
    <PageContainer>
      <PageHeader>
        <PageTitleRow>
          <PageTitle title="Integrations" />
          <PageButtons>
            <LinkButton
              to={docsCreateIntegration()}
              variant="secondary/small"
              LeadingIcon="docs"
            >
              Create your own Integration
            </LinkButton>
          </PageButtons>
        </PageTitleRow>
        <PageDescription>
          Easily use an Integration, an existing Node.js SDK or make HTTP calls
          from a Job.
        </PageDescription>
      </PageHeader>

      <PageBody scrollable={false}>
        <div className="grid h-full max-w-full grid-cols-[2fr_3fr] gap-4 divide-x divide-slate-900 overflow-hidden">
          <PossibleIntegrationsList
            options={options}
            organizationId={organization.id}
            callbackUrl={callbackUrl}
          />
          <ConnectedIntegrationsList
            clients={clients}
            organization={organization}
            project={project}
          />
        </div>
      </PageBody>
    </PageContainer>
  );
}

function PossibleIntegrationsList({
  options,
  organizationId,
  callbackUrl,
}: {
  options: IntegrationOrApi[];
  organizationId: string;
  callbackUrl: string;
}) {
  const [onlyShowIntegrations, setOnlyShowIntegrations] = useState(false);
  const optionsToShow = onlyShowIntegrations
    ? options.filter((o) => o.type === "integration")
    : options;
  const { filterText, setFilterText, filteredItems } =
    useTextFilter<IntegrationOrApi>({
      items: optionsToShow,
      filter: (integration, text) =>
        integration.name.toLowerCase().includes(text.toLowerCase()),
    });

  return (
    <div className="overflow-y-auto py-4 pl-4">
      <div className="flex items-center justify-between">
        <Header2 className="mb-2">Connect an API</Header2>
        <Switch
          checked={onlyShowIntegrations}
          onCheckedChange={setOnlyShowIntegrations}
          variant="small"
          label={
            <span className="inline-flex items-center gap-0.5">
              <IntegrationIcon /> Trigger.dev Integrations
            </span>
          }
        />
      </div>
      <Input
        placeholder="Search APIs"
        className="mb-2"
        variant="tertiary"
        icon="search"
        fullWidth={true}
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
      />
      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[repeat(auto-fill,_minmax(14rem,_auto))]">
        {filteredItems.map((option) => {
          switch (option.type) {
            case "integration":
              return (
                <ConnectToIntegrationSheet
                  key={option.identifier}
                  integration={option}
                  organizationId={organizationId}
                  callbackUrl={callbackUrl}
                  button={
                    <AddIntegrationConnection
                      identifier={option.identifier}
                      name={option.name}
                      isIntegration
                    />
                  }
                />
              );
            case "api":
              return (
                <NoIntegrationSheet
                  key={option.identifier}
                  api={option}
                  requested={option.voted}
                  button={
                    <AddIntegrationConnection
                      identifier={option.identifier}
                      name={option.name}
                      isIntegration={false}
                    />
                  }
                />
              );
          }
        })}
      </div>
    </div>
  );
}

type Client = UseDataFunctionReturn<typeof loader>["clients"][0];

function ConnectedIntegrationsList({
  clients,
  organization,
  project,
}: {
  clients: Client[];
  organization: Organization;
  project: Project;
}) {
  const { filterText, setFilterText, filteredItems } = useTextFilter<Client>({
    items: clients,
    filter: (client, text) => {
      if (client.title.toLowerCase().includes(text.toLowerCase())) {
        return true;
      }

      if (
        client.customClientId &&
        client.customClientId.toLowerCase().includes(text.toLowerCase())
      ) {
        return true;
      }

      if (client.integration.name.toLowerCase().includes(text.toLowerCase())) {
        return true;
      }

      if (client.authMethod.name.toLowerCase().includes(text.toLowerCase())) {
        return true;
      }

      return false;
    },
  });

  return (
    <div className="h-full overflow-y-auto p-4">
      <Help>
        <HelpContent title="How to connect an integration">
          <Paragraph>This is some help content</Paragraph>
        </HelpContent>
        <div className="mb-2 flex items-center justify-between">
          <Header2 className="m-0">Your connected Integrations</Header2>
          <HelpTrigger title="How do I connect an Integration?" />
        </div>
        {clients.length > 0 && (
          <div>
            <Input
              placeholder="Search connected integrations"
              className="mb-2"
              variant="tertiary"
              icon="search"
              fullWidth={true}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>API</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Jobs</TableHeaderCell>
                  <TableHeaderCell>Scopes</TableHeaderCell>
                  <TableHeaderCell>Client id</TableHeaderCell>
                  <TableHeaderCell>Added</TableHeaderCell>
                  <TableHeaderCell hiddenLabel>Go to page</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableBlankRow colSpan={8}>
                    <div className="flex items-center justify-center">
                      <Callout variant="info" className="w-auto">
                        No connected integrations match your filters.
                      </Callout>
                    </div>
                  </TableBlankRow>
                ) : (
                  <>
                    {filteredItems.map((client) => {
                      const path = integrationClientPath(
                        organization,
                        project,
                        client
                      );
                      return (
                        <TableRow key={client.id}>
                          <TableCell to={path}>{client.title}</TableCell>
                          <TableCell to={path}>
                            <span className="flex items-center gap-1">
                              <NamedIcon
                                name={client.integrationIdentifier}
                                className="h-5 w-5"
                              />
                              {client.integration.name}
                            </span>
                          </TableCell>
                          <TableCell to={path}>
                            {client.authMethod.name}
                          </TableCell>
                          <TableCell to={path}>{client.jobCount}</TableCell>
                          <TableCell to={path}>{client.scopesCount}</TableCell>
                          <TableCell to={path}>
                            <SimpleTooltip
                              button={
                                client.customClientId ? (
                                  `${client.customClientId.substring(0, 8)}…`
                                ) : (
                                  <span className="text-slate-600">Auto</span>
                                )
                              }
                              content={
                                client.customClientId
                                  ? client.customClientId
                                  : "This uses the Trigger.dev OAuth client"
                              }
                            />
                          </TableCell>
                          <TableCell to={path}>
                            {formatDateTime(client.createdAt, "medium")}
                          </TableCell>
                          <TableCellChevron to={path} />
                        </TableRow>
                      );
                    })}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Help>
    </div>
  );
}

function AddIntegrationConnection({
  identifier,
  name,
  isIntegration,
}: {
  identifier: string;
  name: string;
  isIntegration: boolean;
}) {
  return (
    <div className="group flex h-11 w-full items-center gap-3 rounded-md p-1 pr-3 transition hover:bg-slate-850">
      <NamedIconInBox
        name={identifier}
        className="h-9 w-9 flex-none transition group-hover:border-slate-750"
      />
      <Paragraph
        variant="base"
        className="m-0 flex-1 text-left transition group-hover:text-bright"
      >
        {name}{" "}
      </Paragraph>
      <div className="flex flex-none items-center gap-1">
        {isIntegration && <IntegrationIcon />}
        <NamedIcon
          name="plus"
          className="h-6 w-6 flex-none text-slate-700 transition group-hover:text-bright"
        />
      </div>
    </div>
  );
}

function IntegrationIcon() {
  return <LogoIcon className="h-3.5 w-3.5 flex-none pb-0.5 text-amber-500" />;
}
