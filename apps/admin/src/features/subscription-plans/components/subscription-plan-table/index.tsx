"use client";

import * as React from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/ui/table/data-table";
import { DataTableToolbar } from "@/components/ui/table/data-table-toolbar";
import { useSuspenseQuery } from "@tanstack/react-query";
import { subscriptionPlansQueryOptions } from "../../api/queries";
import { columns } from "./columns";

// Fully client-side, not the manual-pagination useDataTable hook every other table in
// this app uses — apps/api's GET /subscription-plans has no pagination at all (see
// subscription-plans.schema.ts's list query schema), since a plan catalog is expected
// to stay small (a handful of tiers, occasional custom ones), not grow like the
// Users/Organizations/Individuals tables. Reuses the same DataTable/DataTableToolbar
// presentational components either way.
export function SubscriptionPlanTable() {
  const { data } = useSuspenseQuery(subscriptionPlansQueryOptions({}));

  const table = useReactTable({
    data: data.plans,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: {
      columnPinning: { right: ["actions"] },
      pagination: { pageSize: 20 },
    },
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}

export function SubscriptionPlanTableSkeleton() {
  return (
    <div className="flex flex-1 animate-pulse flex-col gap-4">
      <div className="bg-muted h-10 w-full rounded" />
      <div className="bg-muted h-96 w-full rounded-lg" />
      <div className="bg-muted h-10 w-full rounded" />
    </div>
  );
}
