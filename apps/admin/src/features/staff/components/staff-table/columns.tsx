"use client";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/ui/table/data-table-column-header";
import type { PlatformStaff } from "../../api/types";
import { Column, ColumnDef } from "@tanstack/react-table";
import { Icons } from "@/components/icons";
import { CellAction } from "./cell-action";
import { ROLE_OPTIONS } from "./options";

export const columns: ColumnDef<PlatformStaff>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }: { column: Column<PlatformStaff, unknown> }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.name}</span>
        <span className="text-muted-foreground text-xs">{row.original.email}</span>
      </div>
    ),
    meta: {
      label: "Name",
      placeholder: "Search employees...",
      variant: "text" as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    id: "emailVerified",
    accessorKey: "emailVerified",
    enableSorting: false,
    header: ({ column }: { column: Column<PlatformStaff, unknown> }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => {
      const verified = row.original.emailVerified;
      return verified ? (
        <Badge variant="outline" className="border-green-600 text-green-700">
          Verified
        </Badge>
      ) : (
        <Badge variant="secondary">Unverified</Badge>
      );
    },
  },
  {
    id: "role",
    accessorKey: "role",
    enableSorting: false,
    header: ({ column }: { column: Column<PlatformStaff, unknown> }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ cell }) => {
      const role = cell.getValue<PlatformStaff["role"]>();
      return role ? (
        <Badge variant="outline" className="capitalize">
          {role}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: "Role",
      variant: "multiSelect",
      options: ROLE_OPTIONS,
    },
  },
  {
    id: "status",
    accessorKey: "banned",
    header: "STATUS",
    cell: ({ row }) => {
      const banned = row.original.banned;
      return banned ? (
        <Badge variant="destructive">Banned</Badge>
      ) : (
        <Badge variant="default">Active</Badge>
      );
    },
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: ({ column }: { column: Column<PlatformStaff, unknown> }) => (
      <DataTableColumnHeader column={column} title="Added" />
    ),
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformStaff["createdAt"]>();
      return (
        <span className="text-muted-foreground text-sm">
          {new Date(value).toLocaleDateString()}
        </span>
      );
    },
  },
  {
    id: "updatedAt",
    accessorKey: "updatedAt",
    header: ({ column }: { column: Column<PlatformStaff, unknown> }) => (
      <DataTableColumnHeader column={column} title="Updated" />
    ),
    cell: ({ cell }) => {
      const value = cell.getValue<PlatformStaff["updatedAt"]>();
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
