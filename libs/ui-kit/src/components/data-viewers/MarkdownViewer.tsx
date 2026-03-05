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
            className={cn('overflow-auto prose prose-sm dark:prose-invert max-w-none break-words', className)}
            style={maxHeight ? { maxHeight } : undefined}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    pre: ({ children }) => (
                        <pre className="bg-muted/50 p-2 rounded-md overflow-x-auto text-xs">{children}</pre>
                    ),
                    code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                            <code className="bg-muted/50 px-1 py-0.5 rounded text-xs">{children}</code>
                        ) : (
                            <code className={className}>{children}</code>
                        );
                    },
                    table: ({ children }) => (
                        <table className="border-collapse border border-border text-xs">{children}</table>
                    ),
                    th: ({ children }) => (
                        <th className="border border-border bg-muted/30 px-2 py-1 text-left">{children}</th>
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
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};
