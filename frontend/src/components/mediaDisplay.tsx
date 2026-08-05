import { MediaItem } from "./types";
import { parseFormattedText, processPassage } from "../utils/textParser";

interface MediaDisplayProps {
  mediaItems: MediaItem[];
}

export default function MediaDisplay({ mediaItems }: MediaDisplayProps) {
  if (mediaItems.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {mediaItems.map((item) => {
        if (item.media_type === "passage") {
          const paragraphs = processPassage(item.content);
          return (
            <div
              key={item.media_id}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 text-sm sm:text-[15px] lg:text-base leading-relaxed space-y-3 lg:space-y-4"
            >
              {paragraphs.map((para, i) => {
                // Short first chunk with no leading "(N)" is the passage title
                const isTitle = i === 0 && !/^\(\d/.test(para) && para.length < 300 && !/[.!?]$/.test(para.trim());
                return (
                  <p
                    key={i}
                    className={isTitle ? "font-semibold text-center text-sm sm:text-base mb-1" : ""}
                  >
                    {parseFormattedText(para, `${item.media_id}_${i}`)}
                  </p>
                );
              })}
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
