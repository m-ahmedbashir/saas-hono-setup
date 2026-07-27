import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlatformOrganizationMember } from "../../../api/types";

interface OrganizationMembersTabProps {
  members: PlatformOrganizationMember[];
}

export function OrganizationMembersTab({ members }: OrganizationMembersTabProps) {
  if (members.length === 0) {
    return <p className="text-muted-foreground rounded-lg border p-4 text-sm">No members.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{member.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{member.email}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {member.role}
                </Badge>
              </TableCell>
              <TableCell>
                {member.banned ? (
                  <Badge variant="destructive">Banned</Badge>
                ) : member.emailVerified ? (
                  <Badge variant="outline" className="border-green-600 text-green-700">
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary">Unverified</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(member.joinedAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
