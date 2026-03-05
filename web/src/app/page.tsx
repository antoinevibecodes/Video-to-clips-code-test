import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Video to Clips</h1>
      <p className="text-gray-400 mb-8">
        Upload a video or paste a YouTube URL to extract the best clips.
      </p>
      <UploadForm />
    </div>
  );
}
