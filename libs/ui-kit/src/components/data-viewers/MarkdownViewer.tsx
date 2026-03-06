import ReactMarkdown from 'react-markdown';

import remarkGfm from 'remark-gfm';

import { cn } from '../../utils';

export interface MarkdownViewerProps {
    content: string;
    maxHeight?: number | string;
    className?: string;
}

export const MarkdownViewer = ({ content, maxHeight, className }: MarkdownViewerProps) => {
    return (
        <div
            className={cn('overflow-auto max-w-none break-words text-sm', className)}
            style={maxHeight ? { maxHeight } : undefined}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-0 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h4>,
                    h5: ({ children }) => <h5 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h5>,
                    h6: ({ children }) => <h6 className="text-sm font-medium mb-1 mt-2 first:mt-0">{children}</h6>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground my-2">
                            {children}
                        </blockquote>
                    ),
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    hr: () => <hr className="my-4 border-border" />,
                    pre: ({ children }) => (
                        <pre className="bg-muted/50 p-3 rounded-md overflow-x-auto text-xs my-2">{children}</pre>
                    ),
                    code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                            <code className="bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
                        ) : (
                            <code className={cn('font-mono', className)}>{children}</code>
                        );
                    },
                    table: ({ children }) => (
                        <table className="border-collapse border border-border text-xs my-2 w-full">{children}</table>
                    ),
                    th: ({ children }) => (
                        <th className="border border-border bg-muted/30 px-2 py-1 text-left font-semibold">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
                    a: ({ children, href }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                        >
                            {children}
                        </a>
                    ),
                    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};
