import { MediaItem } from "./types";
import { parseFormattedText } from "../utils/textParser";

interface MediaDisplayProps {
  mediaItems: MediaItem[];
}

export default function MediaDisplay({ mediaItems }: MediaDisplayProps) {
  if (mediaItems.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {mediaItems.map((item) => {
        if (item.media_type === "passage") {
          return (
            <div
              key={item.media_id}
              className="flex-1 min-h-0 w-full overflow-auto bg-gray-50 border border-gray-200 rounded p-4 text-sm leading-relaxed"
            >
              {parseFormattedText(item.content)}
            </div>
          );
        }

        // graph, table, equation — stored as image URLs
        return (
          <img
            key={item.media_id}
            src={item.content}
            alt={item.media_type}
            className="max-w-full h-auto rounded border border-gray-200"
          />
        );
      })}
    </div>
  );
}
