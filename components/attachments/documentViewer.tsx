import type React from "react"
import {useEffect, useState} from "react";
import { sanitizeImportedDocument } from "@/lib/sanitizeHtml";
import { SafeHtml } from "@/components/safeHtml/SafeHtml";

interface DocumentViewerProps {
    type: string
    url?: string
    content?: string
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ type, url, content }) => {
    const [textContent, setTextContent] = useState<string | undefined>(content)
    const [htmlContent, setHtmlContent] = useState<string | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | undefined>(undefined)

    useEffect(() => {
        if (!url) return;

        const fetchAndProcess = async () => {
            setLoading(true);
            setError(undefined);
            try {
                // Text-based files
                if (['txt', 'text', 'csv', 'json', 'xml', 'log', 'md'].includes(type) && !content) {
                    const res = await fetch(url);
                    const text = await res.text();
                    setTextContent(text);
                }
                // DOCX — lazy-load mammoth so it doesn't bloat the
                // every-page bundle. mammoth is ~700 KB and only used
                // when the user opens a .docx attachment.
                else if (['docx', 'doc'].includes(type)) {
                    const res = await fetch(url);
                    const arrayBuffer = await res.arrayBuffer();
                    const mammoth = await import("mammoth");
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    setHtmlContent(result.value);
                }
                // Excel — same lazy-load story; xlsx is ~900 KB.
                else if (['xlsx', 'xls'].includes(type)) {
                    const res = await fetch(url);
                    const arrayBuffer = await res.arrayBuffer();
                    const XLSX = await import("xlsx");
                    const workbook = XLSX.read(arrayBuffer);
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const html = XLSX.utils.sheet_to_html(sheet);
                    setHtmlContent(html);
                }
            } catch (err) {
                console.error("Error rendering document:", err);
                setError("Failed to render document locally.");
            } finally {
                setLoading(false);
            }
        };

        fetchAndProcess();
    }, [type, url, content]);

    if (type === "pdf") {
        return (
            <div className="w-full h-[60vh] md:h-[80vh] bg-white rounded-lg overflow-hidden shadow-lg">
                <iframe
                    src={`${url}#toolbar=1&navpanes=1&scrollbar=1`}
                    className="w-full h-full border-0"
                    title="PDF Document"
                    style={{ maxWidth: "100%", overflow: "auto" }}
                />
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh] w-full bg-card rounded-lg border border-border/50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (error) {
        return (
             <div className="flex flex-col items-center justify-center p-8 text-muted-foreground bg-card/50 rounded-lg border border-border/50 border-dashed h-[60vh]">
                <p className="font-medium text-destructive">{error}</p>
                <a href={url} download className="text-primary hover:underline font-medium mt-2">
                    Download to view
                </a>
            </div>
        )
    }

    if (htmlContent) {
        return (
            <div className="w-full h-[60vh] md:h-[80vh] bg-white rounded-lg overflow-hidden shadow-lg flex flex-col">
                <div className="flex-1 overflow-auto p-8 prose max-w-none dark:prose-invert bg-white text-black">
                    <SafeHtml html={htmlContent} sanitizer={sanitizeImportedDocument} />
                </div>
                 <div className="bg-muted/50 p-3 text-center text-sm text-muted-foreground border-t border-border/50">
                    <span>Rendering locally. Formatting may vary. </span>
                    <a href={url} download className="text-primary hover:underline font-medium ml-1">
                        Download original
                    </a>
                </div>
            </div>
        )
    }

    if (textContent) {
        return (
            <div className="p-4 md:p-8 max-h-[60vh] md:max-h-[80vh] overflow-auto w-full bg-card rounded-lg shadow-inner border border-border/50">
                <pre className="whitespace-pre-wrap font-mono text-xs md:text-sm break-words text-card-foreground">{textContent}</pre>
            </div>
        )
    }

    if (type === "image" && url) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <img src={url || "/placeholder.svg"} alt="Document" className="max-w-full max-h-full object-contain rounded-md shadow-md" />
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground bg-card/50 rounded-lg border border-border/50 border-dashed">
            <p className="font-medium">
                {type === "other" ? "Unsupported document type" : "No document to display"}
            </p>
            {type === "other" && <p className="text-sm mt-2">Try downloading the file to view it.</p>}
        </div>
    )
}

export default DocumentViewer
