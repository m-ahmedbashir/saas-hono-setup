"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { PlatformIndividual } from "../../api/types";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import {
  PLAN_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS,
  ORGANIZATION_ASSOCIATION_OPTIONS,
} from "./options";

// Plain string headers, not DataTableColumnHeader — same reasoning as
// organizations-table/columns.tsx: this endpoint has no sortBy param, so a sortable
// header would toggle URL state nothing on the server reads. Pagination and the
// name/email search filter (via DataTableToolbar, wired in index.tsx) are real.
export const columns: ColumnDef<PlatformIndividual>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/dashboard/individuals/${row.original.id}`}
        className="focus-visible:ring-ring flex min-w-0 flex-col rounded focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span className="truncate font-medium hover:underline">{row.original.name}</span>
        <span className="text-muted-foreground truncate text-xs">{row.original.email}</span>
      </Link>
    ),
    meta: {
      label: "Name",
      placeholder: "Search individuals...",
      variant: "text" as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const individual = row.original;
      return (
        <div className="flex flex-wrap gap-1">
          {individual.emailVerified ? (
            <Badge variant="outline" className="border-green-600 text-green-700">
              Verified
            </Badge>
          ) : (
            <Badge variant="secondary">Unverified</Badge>
          )}
          {individual.banned && <Badge variant="destructive">Banned</Badge>}
        </div>
      );
    },
  },
  {
    id: "organizations",
    header: "Organizations",
    // Filter meta lives on the same column as the display cell (same technique as
    // Users' role column) rather than a separate hidden column — "has"/"none" maps to
    // the API's hasOrganization boolean in index.tsx, since a person's actual org list
    // can't itself be reduced to one facet value.
    enableColumnFilter: true,
    meta: {
      label: "Organization",
      variant: "select",
      options: ORGANIZATION_ASSOCIATION_OPTIONS,
    },
    // A person can belong to more than one org (member has no unique-per-user
    // constraint) — the first is a real link into that org's detail page, a "+N"
    // badge surfaces the rest rather than silently truncating them away. See
    // specs/platform-individuals.md's "production-grade, not a shortcut" section.
    cell: ({ row }) => {
      const organizations = row.original.organizations;
      if (organizations.length === 0) {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
      const [first, ...rest] = organizations;
      return (
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={`/dashboard/organizations/${first!.id}`}
            className="focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Badge variant="outline" className="hover:bg-accent max-w-32 truncate">
              {first!.name}
            </Badge>
          </Link>
          {rest.length > 0 && <Badge variant="secondary">+{rest.length}</Badge>}
        </div>
      );
    },
  },
  {
    id: "phone",
    accessorKey: "phone",
    header: "Phone",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformIndividual["phone"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "plan",
    accessorKey: "plan",
    header: "Plan",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformIndividual["plan"]>();
      return value ? (
        <Badge variant="outline" className="capitalize">
          {value}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: "Plan",
      variant: "multiSelect",
      options: PLAN_OPTIONS,
    },
  },
  {
    id: "subscriptionStatus",
    accessorKey: "subscriptionStatus",
    header: "Billing Status",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformIndividual["subscriptionStatus"]>();
      return value ? (
        <Badge variant="secondary" className="capitalize">
          {value}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: "Billing Status",
      variant: "multiSelect",
      options: SUBSCRIPTION_STATUS_OPTIONS,
    },
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformIndividual["createdAt"]>();
      return (
        <span className="text-muted-foreground text-sm">
          {new Date(value).toLocaleDateString()}
        </span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
