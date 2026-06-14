import React from 'react';
import { cn } from '@/lib/utils/helpers/cn';
import { sanitizeRichHtml } from '@/lib/sanitizeHtml';
import { SafeHtml } from '@/components/safeHtml/SafeHtml';

interface DocPreviewProps {
    content: string;
    className?: string;
}

export const DocPreview: React.FC<DocPreviewProps> = ({ content, className }) => {
    const hasContent = content && content.trim().length > 0 && !content.includes('Empty document');

    return (
        <div className={cn(
            "relative w-full h-full flex items-start justify-center pt-3 px-3 pb-0",
            "bg-[#f8f9fa]",
            className
        )}>
            {/* White page with shadow — the actual preview */}
            <div 
                className="bg-white shadow-[0_1px_2px_rgba(60,64,67,0.15)] overflow-hidden"
                style={{ 
                    width: '85%',
                    aspectRatio: '1 / 1.294',
                    maxHeight: 'calc(100% - 4px)'
                }}
            >
                {hasContent ? (
                    <SafeHtml
                        as="div"
                        className="w-full h-full overflow-hidden"
                        sanitizer={sanitizePreviewContent}
                        html={content}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[9px] text-[#dadce0] font-medium">Blank</span>
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Prepare HTML content for miniature preview display.
 * Renders at native small sizes for sharp text (no CSS scale transforms).
 *
 * SECURITY: the styling logic below operates on a detached DOM, then
 * the result is reattached via dangerouslySetInnerHTML. Without
 * sanitisation a script tag in the doc body would execute when the
 * preview is rendered. We pass everything through sanitizeRichHtml
 * first, then run the cosmetic styling on the cleaned subtree.
 */
function sanitizePreviewContent(html: string): string {
    if (!html) return '';

    // First-pass strip of any dangerous tags / attributes.
    const cleaned = sanitizeRichHtml(html);

    if (typeof document === 'undefined') {
        // Basic fallback for Server-Side Rendering — return the
        // sanitised HTML wrapped in our preview container.
        return `<div style="padding:10px 12px 0 12px; font-size: 9px; color: #3c4043;">${cleaned}</div>`;
    }

    const temp = document.createElement('div');
    temp.innerHTML = cleaned;

    // Remove task checkbox attributes
    temp.querySelectorAll('li[data-checked]').forEach(item => {
        item.removeAttribute('data-checked');
    });

    // Base font for all text
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
        const style = (el as HTMLElement).style;
        style.color = '#202124';
        style.fontFamily = "'Google Sans', 'Roboto', Arial, sans-serif";
    });

    // Headings — Google Docs style sizes at preview scale
    const headings = temp.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
        const el = heading as HTMLElement;
        const tag = heading.tagName.toLowerCase();
        el.style.color = '#202124';
        el.style.fontWeight = tag === 'h1' ? '700' : '600';
        el.style.fontSize = tag === 'h1' ? '11px' : tag === 'h2' ? '10px' : '9px';
        el.style.lineHeight = '1.35';
        el.style.margin = '0 0 4px 0';
        el.style.letterSpacing = '-0.1px';
    });

    // Paragraphs
    temp.querySelectorAll('p').forEach(p => {
        const el = p as HTMLElement;
        el.style.color = '#3c4043';
        el.style.fontSize = '9px';
        el.style.lineHeight = '1.55';
        el.style.margin = '0 0 3px 0';
    });

    // Lists
    temp.querySelectorAll('ul, ol').forEach(list => {
        const el = list as HTMLElement;
        el.style.margin = '0 0 3px 0';
        el.style.paddingLeft = '12px';
        el.style.color = '#3c4043';
    });

    temp.querySelectorAll('li').forEach(item => {
        const el = item as HTMLElement;
        el.style.fontSize = '9px';
        el.style.lineHeight = '1.45';
        el.style.margin = '0 0 1px 0';
        el.style.color = '#3c4043';
    });

    // Blockquotes
    temp.querySelectorAll('blockquote').forEach(bq => {
        const el = bq as HTMLElement;
        el.style.borderLeft = '1.5px solid #dadce0';
        el.style.paddingLeft = '8px';
        el.style.margin = '0 0 3px 0';
        el.style.color = '#5f6368';
        el.style.fontSize = '9px';
        el.style.fontStyle = 'italic';
    });

    // Code blocks
    temp.querySelectorAll('pre').forEach(pre => {
        const el = pre as HTMLElement;
        el.style.background = '#f1f3f4';
        el.style.padding = '3px 5px';
        el.style.borderRadius = '3px';
        el.style.fontSize = '8px';
        el.style.margin = '0 0 3px 0';
        el.style.overflow = 'hidden';
        el.style.color = '#3c4043';
        el.style.fontFamily = "'Roboto Mono', monospace";
    });

    // Inline code
    temp.querySelectorAll('code:not(pre code)').forEach(code => {
        const el = code as HTMLElement;
        el.style.background = '#f1f3f4';
        el.style.padding = '0.5px 3px';
        el.style.borderRadius = '2px';
        el.style.fontSize = '8px';
        el.style.color = '#3c4043';
        el.style.fontFamily = "'Roboto Mono', monospace";
    });

    // HR
    temp.querySelectorAll('hr').forEach(hr => {
        const el = hr as HTMLElement;
        el.style.border = 'none';
        el.style.borderTop = '0.5px solid #dadce0';
        el.style.margin = '4px 0';
    });

    // Links — keep blue but remove interaction
    temp.querySelectorAll('a').forEach(link => {
        link.removeAttribute('href');
        const el = link as HTMLElement;
        el.style.color = '#1a73e8';
        el.style.textDecoration = 'none';
    });

    // Callouts
    temp.querySelectorAll('[class*="callout"]').forEach(callout => {
        const el = callout as HTMLElement;
        el.style.background = '#f8f9fa';
        el.style.borderRadius = '4px';
        el.style.padding = '4px 6px';
        el.style.margin = '0 0 3px 0';
        el.style.border = '0.5px solid #dadce0';
    });

    // Collapsible / Toggle
    temp.querySelectorAll('[class*="collapsible"]').forEach(col => {
        const el = col as HTMLElement;
        el.style.background = '#f8f9fa';
        el.style.borderRadius = '4px';
        el.style.padding = '3px 6px';
        el.style.margin = '0 0 3px 0';
    });

    // Bold
    temp.querySelectorAll('strong, b').forEach(el => {
        (el as HTMLElement).style.color = '#202124';
        (el as HTMLElement).style.fontWeight = '600';
    });

    // Italic
    temp.querySelectorAll('em, i').forEach(el => {
        (el as HTMLElement).style.color = '#3c4043';
    });

    // Strikethrough
    temp.querySelectorAll('s, strike, del').forEach(el => {
        (el as HTMLElement).style.color = '#9aa0a6';
        (el as HTMLElement).style.textDecoration = 'line-through';
    });

    // Tables
    temp.querySelectorAll('table').forEach(table => {
        const el = table as HTMLElement;
        el.style.width = '100%';
        el.style.borderCollapse = 'collapse';
        el.style.fontSize = '8px';
        el.style.margin = '0 0 3px 0';
    });
    temp.querySelectorAll('td, th').forEach(cell => {
        const el = cell as HTMLElement;
        el.style.border = '0.5px solid #dadce0';
        el.style.padding = '2px 4px';
        el.style.fontSize = '8px';
    });
    temp.querySelectorAll('th').forEach(th => {
        const el = th as HTMLElement;
        el.style.background = '#f8f9fa';
        el.style.fontWeight = '600';
    });

    // Task lists
    temp.querySelectorAll('.task-list').forEach(list => {
        const el = list as HTMLElement;
        el.style.listStyle = 'none';
        el.style.paddingLeft = '0';
    });
    temp.querySelectorAll('.task-item').forEach(item => {
        const el = item as HTMLElement;
        el.style.display = 'flex';
        el.style.alignItems = 'flex-start';
        el.style.gap = '4px';
        el.style.fontSize = '9px';
        el.style.margin = '0 0 1px 0';
    });

    let result = temp.innerHTML;
    
    // Truncate if too long
    if (result.length > 2500) {
        result = result.substring(0, 2500);
        result = result.replace(/<[^>]*$/, ''); 
        result += '<span style="color:#bdc1c6;font-size:8px;">…</span>';
    }

    // Wrap in padded container
    return `<div style="padding:10px 12px 0 12px;">${result}</div>`;
}
