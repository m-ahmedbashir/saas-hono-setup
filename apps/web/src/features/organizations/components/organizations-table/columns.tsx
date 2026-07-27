"use client";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { PlatformOrganization } from "../../api/types";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

// Plain string headers, not DataTableColumnHeader — this endpoint (apps/api/src/
// modules/platform-organizations) has no sortBy/sortDirection param, so a sortable
// header here would toggle URL state that nothing on the server ever reads. Pagination
// AND the name search filter (via DataTableToolbar, wired in index.tsx) are real —
// both round-trip to the server — sorting isn't, hence no DataTableColumnHeader.
export const columns: ColumnDef<PlatformOrganization>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.name}</span>
        <span className="text-muted-foreground text-xs">{row.original.slug}</span>
      </div>
    ),
    meta: {
      label: "Name",
      placeholder: "Search organizations...",
      variant: "text" as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    id: "suspended",
    accessorKey: "suspended",
    header: "Status",
    // Suspended state, own to the organization — separate from the Owner column's
    // Verified/Banned badges, which describe the owner *user*, not the org row itself.
    // Flag-only (see specs/platform-organizations.md): shown for visibility, doesn't
    // reflect any real access restriction yet.
    cell: ({ row }) => {
      const org = row.original;
      if (!org.suspended) {
        return <Badge variant="default">Active</Badge>;
      }
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <Badge variant="destructive">Suspended</Badge>
          {org.suspensionReason && (
            <span className="text-muted-foreground max-w-40 truncate text-xs">
              {org.suspensionReason}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: "owner",
    // No single accessorKey — combines name/email/verified/banned into one cell so an
    // admin sees everything about the owner at a glance, not spread across four
    // columns. Verified/Unverified badge style matches features/users' columns.tsx.
    header: "Owner",
    cell: ({ row }) => {
      const org = row.original;
      if (!org.ownerEmail) {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
      return (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{org.ownerName ?? org.ownerEmail}</span>
            <span className="text-muted-foreground truncate text-xs">{org.ownerEmail}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {org.ownerEmailVerified ? (
              <Badge variant="outline" className="border-green-600 text-[10px] text-green-700">
                Verified
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Unverified
              </Badge>
            )}
            {org.ownerBanned && (
              <Badge variant="destructive" className="text-[10px]">
                Banned
              </Badge>
            )}
          </div>
        </div>
      );
    },
  },
  {
    id: "memberCount",
    accessorKey: "memberCount",
    header: "Members",
  },
  {
    id: "plan",
    accessorKey: "plan",
    header: "Plan",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["plan"]>();
      return value ? (
        <Badge variant="outline" className="capitalize">
          {value}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
  },
  {
    id: "seatQuantity",
    accessorKey: "seatQuantity",
    header: "Seats",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["seatQuantity"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "subscriptionStatus",
    accessorKey: "subscriptionStatus",
    header: "Billing Status",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["subscriptionStatus"]>();
      return value ? (
        <Badge variant="secondary" className="capitalize">
          {value}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
  },
  {
    id: "orgNumber",
    accessorKey: "orgNumber",
    header: "Org #",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["orgNumber"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "industry",
    accessorKey: "industry",
    header: "Industry",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["industry"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "companySize",
    accessorKey: "companySize",
    header: "Company Size",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["companySize"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "phone",
    accessorKey: "phone",
    header: "Phone",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["phone"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "taxId",
    accessorKey: "taxId",
    header: "Tax ID",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["taxId"]>();
      return value ?? <span className="text-muted-foreground text-xs">—</span>;
    },
  },
  {
    id: "website",
    accessorKey: "website",
    header: "Website",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["website"]>();
      if (!value) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-primary max-w-40 truncate text-sm hover:underline"
        >
          {value}
        </a>
      );
    },
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformOrganization["createdAt"]>();
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
