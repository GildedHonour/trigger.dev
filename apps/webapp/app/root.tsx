import type { LinksFunction, LoaderArgs } from "@remix-run/node";
import type { ShouldRevalidateFunction } from "@remix-run/react";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "@remix-run/react";
import {
  TypedMetaFunction,
  typedjson,
  useTypedLoaderData,
} from "remix-typedjson";
import type { ToastMessage } from "~/models/message.server";
import { commitSession, getSession } from "~/models/message.server";
import tailwindStylesheetUrl from "~/tailwind.css";
import {
  AppContainer,
  MainCenteredContainer,
} from "./components/layout/AppLayout";
import { LinkButton } from "./components/primitives/Buttons";
import { Header1, Header3 } from "./components/primitives/Headers";
import { Toast } from "./components/primitives/Toast";
import { env } from "./env.server";
import { featuresForRequest } from "./features.server";
import { usePostHog } from "./hooks/usePostHog";
import { getUser } from "./services/session.server";
import { appEnvTitleTag } from "./utils";
import { friendlyErrorDisplay } from "./utils/httpErrors";

export const links: LinksFunction = () => {
  return [{ rel: "stylesheet", href: tailwindStylesheetUrl }];
};

export const meta: TypedMetaFunction<typeof loader> = ({ data }) => ({
  title: `Trigger.dev${appEnvTitleTag(data.appEnv)}`,
  charset: "utf-8",
  viewport: "width=device-width,initial-scale=1",
});

export const loader = async ({ request }: LoaderArgs) => {
  const session = await getSession(request.headers.get("cookie"));
  const toastMessage = session.get("toastMessage") as ToastMessage;
  const posthogProjectKey = env.POSTHOG_PROJECT_KEY;
  const features = featuresForRequest(request);

  return typedjson(
    {
      user: await getUser(request),
      toastMessage,
      posthogProjectKey,
      features,
      appEnv: env.APP_ENV,
    },
    { headers: { "Set-Cookie": await commitSession(session) } }
  );
};

export type LoaderType = typeof loader;

export const shouldRevalidate: ShouldRevalidateFunction = (options) => {
  if (options.formAction === "/resources/environment") {
    return false;
  }

  return true;
};

export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <html lang="en" className="h-full">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="h-full overflow-hidden bg-darkBackground">
        <AppContainer showBackgroundGradient={true}>
          <MainCenteredContainer>
            {isRouteErrorResponse(error) ? (
              <ErrorDisplay
                title={
                  friendlyErrorDisplay(error.status, error.statusText).title
                }
                message={
                  error.data.message ??
                  friendlyErrorDisplay(error.status, error.statusText).message
                }
              />
            ) : error instanceof Error ? (
              <ErrorDisplay title={error.name} message={error.message} />
            ) : (
              <ErrorDisplay title="Oops" message={JSON.stringify(error)} />
            )}
          </MainCenteredContainer>
        </AppContainer>
        <Scripts />
      </body>
    </html>
  );
}

function ErrorDisplay({ title, message }: { title: string; message?: string }) {
  return (
    <div className="p-4">
      <Header1 className="mb-4 border-b border-slate-800 pb-4">{title}</Header1>
      {message && <Header3>{message}</Header3>}
      <LinkButton to="/" variant="primary/medium" className="mt-8">
        Home
      </LinkButton>
    </div>
  );
}

function App() {
  const { posthogProjectKey } = useTypedLoaderData<typeof loader>();
  usePostHog(posthogProjectKey);

  return (
    <html lang="en" className="h-full">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="h-full overflow-hidden bg-darkBackground">
        <Outlet />
        <Toast />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export default App;
