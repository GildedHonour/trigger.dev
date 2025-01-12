import { LoaderArgs } from "@remix-run/server-runtime";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import invariant from "tiny-invariant";
import { z } from "zod";
import { RunsTable } from "~/components/runs/RunsTable";
import { RunListPresenter } from "~/presenters/RunListPresenter.server";
import { requireUserId } from "~/services/session.server";
import { Handle } from "~/utils/handle";
import { ListPagination } from "./ListPagination";
import { useNavigation } from "@remix-run/react";
import { JobParamsSchema } from "~/utils/pathBuilder";

export const DirectionSchema = z.union([
  z.literal("forward"),
  z.literal("backward"),
]);

const SearchSchema = z.object({
  cursor: z.string().optional(),
  direction: DirectionSchema.optional(),
});

export const loader = async ({ request, params }: LoaderArgs) => {
  const userId = await requireUserId(request);
  const { jobParam, projectParam, organizationSlug } =
    JobParamsSchema.parse(params);

  const url = new URL(request.url);
  const s = Object.fromEntries(url.searchParams.entries());
  const searchParams = SearchSchema.parse(s);

  const presenter = new RunListPresenter();
  const list = await presenter.call({
    userId,
    jobSlug: jobParam,
    projectSlug: projectParam,
    organizationSlug,
    direction: searchParams.direction,
    cursor: searchParams.cursor,
  });

  return typedjson({
    list,
  });
};

export const handle: Handle = {
  breadcrumb: {
    slug: "runs",
  },
};

export default function Page() {
  const { list } = useTypedLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  return (
    <div>
      <ListPagination list={list} className="mb-1 justify-end" />
      <RunsTable
        total={list.runs.length}
        hasFilters={false}
        runs={list.runs}
        isLoading={isLoading}
      />
      <ListPagination list={list} className="mb-1 justify-end" />
    </div>
  );
}
