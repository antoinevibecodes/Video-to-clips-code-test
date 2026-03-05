import Link from "next/link";
import JobStatus from "@/components/JobStatus";

export default function JobPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-300 mb-6 inline-block"
      >
        &larr; New job
      </Link>
      <JobStatus jobId={params.id} />
    </div>
  );
}
