import React from 'react';
import { cn } from '@/lib/utils/helpers/cn';
import { sanitizeRichHtml } from '@/lib/sanitizeHtml';
import { SafeHtml } from '@/components/safeHtml/SafeHtml';
import { FileText } from '@/lib/icons';

interface DocPreviewProps {
    content: string;
    /** The doc's title, set at the top of the page as the doc sets it. */
    title?: string;
    /** The thumbnail size of a phone row: a small page, no text. */
    compact?: boolean;
    className?: string;
}

/**
 * A doc's first lines as a page (content.md D02): a sheet on the sunken
 * ground, bleeding off the bottom into a 24 px fade, holding the real title
 * and opening text in the doc's own type. The text is set at twice the size
 * and scaled by half, so it stays crisp instead of being restyled inline at
 * 9 px. Under the card's pointer the page rises 2 px, as if picked up.
 */
export const DocPreview: React.FC<DocPreviewProps> = ({ content, title, compact, className }) => {
    const hasContent = !!content && content.trim().length > 0 && !content.includes('Empty document');

    return (
        <div className={cn("relative h-full w-full overflow-hidden bg-sunken", compact ? "px-1.5 pt-1.5" : "px-4 pt-4", className)}>
            <div
                data-doc-page=""
                className={cn(
                    "relative h-full overflow-hidden bg-sheet shadow-e1 transition-transform duration-[140ms] ease-[var(--ease-out)] group-hover:-translate-y-0.5 motion-reduce:transform-none",
                    compact ? "rounded-t-[3px]" : "rounded-t-md"
                )}
            >
                {compact ? null : hasContent || title ? (
                    <div className="pointer-events-none w-[200%] origin-top-left scale-50 px-7 pt-6 text-ink select-none" aria-hidden="true">
                        {title ? <div className="mb-2 text-lg font-semibold leading-[26px] text-ink">{title}</div> : null}
                        {hasContent ? (
                            <SafeHtml
                                as="div"
                                className={cn(
                                    "text-sm leading-[22px] text-ink-2",
                                    "[&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-ink",
                                    "[&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink",
                                    "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-ink",
                                    "[&_p]:mb-1 [&_strong]:font-semibold [&_strong]:text-ink [&_a]:text-brand-text",
                                    "[&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5",
                                    "[&_img]:hidden [&_table]:hidden [&_pre]:hidden"
                                )}
                                sanitizer={sanitizePreviewContent}
                                html={content}
                            />
                        ) : null}
                    </div>
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-4" aria-hidden="true">
                        <FileText className="size-5" />
                    </div>
                )}
            </div>
            {!compact ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-sunken" /> : null}
        </div>
    );
};

/**
 * The doc's HTML, cleaned (a script in a doc body must never run here) and
 * cut to its opening: a preview shows a few lines, so 2,500 characters is
 * plenty and keeps a long doc's card cheap.
 */
export function sanitizePreviewContent(html: string): string {
    if (!html) return '';
    // A list hit carries a plain-text snippet, not the doc's HTML.
    const source = /<[a-z][\s\S]*>/i.test(html)
        ? html
        : `<p>${html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
    let result = sanitizeRichHtml(source);
    if (result.length > 2500) {
        result = result.substring(0, 2500).replace(/<[^>]*$/, '');
    }
    return result;
}
