export function IndividualDetailSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="bg-muted h-20 w-full rounded-lg" />
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="bg-muted h-24 w-full rounded" />
        <div className="bg-muted h-24 w-full rounded" />
        <div className="bg-muted h-48 w-full rounded" />
      </div>
    </div>
  );
}
