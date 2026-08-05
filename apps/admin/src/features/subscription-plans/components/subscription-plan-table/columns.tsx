"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { SubscriptionPlan } from "../../api/types";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { OWNER_TYPE_OPTIONS } from "../../options";

// Plain string headers, no DataTableColumnHeader — this catalog has no server-side
// sort (the whole list fetches in one shot, unpaginated; see index.tsx), so a sortable
// header would only ever do client-side re-ordering, not worth the affordance here.
export const columns: ColumnDef<SubscriptionPlan>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.original.name}</span>
        <span className="text-muted-foreground truncate text-xs">{row.original.planId}</span>
      </div>
    ),
    meta: {
      label: "Name",
      placeholder: "Search plans...",
      variant: "text" as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
    filterFn: (row, _id, value: string) => {
      const search = value.toLowerCase();
      return (
        row.original.name.toLowerCase().includes(search) ||
        row.original.planId.toLowerCase().includes(search)
      );
    },
  },
  {
    id: "ownerType",
    accessorKey: "ownerType",
    header: "Applies To",
    cell: ({ row }) => <span className="capitalize">{row.original.ownerType}</span>,
    enableColumnFilter: true,
    meta: { label: "Applies To", variant: "select", options: OWNER_TYPE_OPTIONS },
  },
  {
    id: "scope",
    header: "Scope",
    cell: ({ row }) => {
      const orgId = row.original.organizationId;
      if (!orgId) return <Badge variant="outline">Shared</Badge>;
      return (
        <Link
          href={`/dashboard/organizations/${orgId}`}
          className="focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Badge variant="secondary" className="hover:bg-accent">
            Custom
          </Badge>
        </Link>
      );
    },
  },
  {
    id: "seatLimit",
    accessorKey: "seatLimit",
    header: "Seat Limit",
    cell: ({ cell }) => {
      const value = cell.getValue<SubscriptionPlan["seatLimit"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const plan = row.original;
      return (
        <div className="flex flex-wrap gap-1">
          {plan.isActive ? (
            <Badge variant="outline" className="border-green-600 text-green-700">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
          {plan.isDefault && <Badge variant="default">Default</Badge>}
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
