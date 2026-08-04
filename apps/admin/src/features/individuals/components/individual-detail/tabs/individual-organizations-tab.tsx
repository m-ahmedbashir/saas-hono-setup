import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlatformIndividualOrganization } from "../../../api/types";

interface IndividualOrganizationsTabProps {
  organizations: PlatformIndividualOrganization[];
}

export function IndividualOrganizationsTab({ organizations }: IndividualOrganizationsTabProps) {
  if (organizations.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border p-4 text-sm">
        Not a member of any organization.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Organization</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((organization) => (
            <TableRow key={organization.id}>
              <TableCell>
                <Link
                  href={`/dashboard/organizations/${organization.id}`}
                  className="focus-visible:ring-ring truncate font-medium hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {organization.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {organization.role}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
