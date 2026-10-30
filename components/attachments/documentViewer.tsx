import type React from "react"
import {useEffect, useState} from "react";
import { sanitizeImportedDocument } from "@/lib/sanitizeHtml";
import { SafeHtml } from "@/components/safeHtml/SafeHtml";
import { useStableCallback } from "@/hooks/useStableCallback";

interface DocumentViewerProps {
    type: string
    url?: string
    content?: string
    /** What stands in for a file it can't show (the stage's card): never a blank page. */
    fallback?: React.ReactNode
}

/**
 * A browser that shows no PDF in a page (a phone's Chrome, a headless one)
 * says so (navigator.pdfViewerEnabled): its frame would stay blank.
 */
const noPdfViewer = () => typeof navigator !== "undefined" && navigator.pdfViewerEnabled === false

const DocumentViewer: React.FC<DocumentViewerProps> = ({ type, url, content, fallback }) => {
    const [textContent, setTextContent] = useState<string | undefined>(content)
    const [htmlContent, setHtmlContent] = useState<string | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | undefined>(undefined)
    // A PDF is read from its own bytes: its stored file is served as a
    // download (Content-Disposition: attachment), so a frame pointed at its
    // address saved it instead of showing it.
    const [pdfUrl, setPdfUrl] = useState<string | undefined>(undefined)
    // The address is signed, and renewed every few minutes while the viewer
    // is open (useMediaFetch); the file is the same one, so it is read once.
    // Read again at each renewal, a PDF went back to its first page.
    const file = url?.split("?")[0]
    const signedUrl = useStableCallback(() => url)

    const cantShowPdf = type === "pdf" && noPdfViewer()

    useEffect(() => {
        const at = signedUrl()
        if (!file || !at || cantShowPdf) return;
        let live = true
        let made: string | undefined

        const fetchAndProcess = async () => {
            setLoading(true);
            setError(undefined);
            try {
                if (type === 'pdf') {
                    const res = await fetch(at);
                    if (!res.ok) throw new Error(String(res.status));
                    const blobUrl = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'application/pdf' }));
                    if (live) {
                        made = blobUrl;
                        setPdfUrl(blobUrl);
                    } else {
                        // Closed or moved on meanwhile: nothing will show it.
                        URL.revokeObjectURL(blobUrl);
                    }
                }
                // Text-based files
                else if (['txt', 'text', 'csv', 'json', 'xml', 'log', 'md'].includes(type) && !content) {
                    const res = await fetch(at);
                    // A refusal's page is not the file's text.
                    if (!res.ok) throw new Error(String(res.status));
                    const text = await res.text();
                    setTextContent(text);
                }
                // DOCX — lazy-load mammoth so it doesn't bloat the
                // every-page bundle. mammoth is ~700 KB and only used
                // when the user opens a .docx attachment.
                else if (['docx', 'doc'].includes(type)) {
                    const res = await fetch(at);
                    if (!res.ok) throw new Error(String(res.status));
                    const arrayBuffer = await res.arrayBuffer();
                    const mammoth = await import("mammoth");
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    setHtmlContent(result.value);
                }
                // Excel — same lazy-load story; xlsx is ~900 KB.
                else if (['xlsx', 'xls'].includes(type)) {
                    const res = await fetch(at);
                    if (!res.ok) throw new Error(String(res.status));
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
        return () => {
            live = false
            if (made) URL.revokeObjectURL(made)
        }
    }, [type, file, content, signedUrl, cantShowPdf]);

    // A file it can't show is its card, with Download.
    if (fallback && (cantShowPdf || error)) return <>{fallback}</>

    if (type === "pdf" && pdfUrl) {
        return (
            <div className="w-full h-[60vh] md:h-[80vh] bg-white rounded-lg overflow-hidden shadow-e3">
                <iframe
                    src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1`}
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

    if (error || cantShowPdf) {
        return (
             <div className="flex flex-col items-center justify-center p-8 text-muted-foreground bg-card/50 rounded-lg border border-border/50 border-dashed h-[60vh]">
                <p className="font-medium text-danger-ink">{error ?? "This browser can't show a PDF here."}</p>
                <a href={url} download className="text-primary hover:underline font-medium mt-2">
                    Download to view
                </a>
            </div>
        )
    }

    if (htmlContent) {
        return (
            <div className="w-full h-[60vh] md:h-[80vh] bg-white rounded-lg overflow-hidden shadow-e3 flex flex-col">
                <div className="flex-1 overflow-auto p-8 max-w-none bg-white text-black">
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
                <img src={url || "/placeholder.svg"} alt="Document" className="max-w-full max-h-full object-contain rounded-md shadow-e3" />
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
