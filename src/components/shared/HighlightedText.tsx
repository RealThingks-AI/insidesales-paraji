import { cn } from "@/lib/utils";

interface HighlightedTextProps {
  text: string | undefined | null;
  highlight: string;
  className?: string;
}

export const HighlightedText = ({ text, highlight, className }: HighlightedTextProps) => {
  if (!text) return <span className={cn("block text-center w-full", className)}>-</span>;
  if (!highlight.trim()) return <span className={className}>{text}</span>;

  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className={cn("truncate block", className)} title={text}>
      {parts.map((part, index) => 
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 text-foreground px-0.5 rounded-sm">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
};
