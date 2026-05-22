"use client"

import { useSearchParams } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Search, ArrowLeft, X, Eye } from "@/lib/icons";
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils/helpers/cn"
import { useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSearch } from "@/hooks/useSearch"
import { getIcon, getHighlightedTitle, getHighlightedContext, isResultPreviewable } from "@/lib/utils/helpers/search"

export default function SearchPage() {
    const searchParams = useSearchParams()
    const query = searchParams.get("query") || ""
    const router = useRouter()
    
    const {
        inputValue,
        setInputValue,
        results,
        isLoading,
        handleResultClick,
        handlePreview,
        handleSearchSubmit
    } = useSearch({ initialQuery: query })

    useEffect(() => {
        setInputValue(query)
    }, [query, setInputValue])

    const onSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleSearchSubmit()
    }

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden font-sans">
            {/* Header with Search Group */}
            <div className="flex flex-col gap-4 p-4 md:p-6 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        aria-label="Go back"
                        className="h-8 w-8 md:h-10 md:w-10 rounded-full shrink-0"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-base md:text-lg font-semibold text-foreground truncate">
                        {query ? `Results for "${query}"` : "Global Search"}
                    </h1>
                </div>

                <form onSubmit={onSearchSubmit} className="relative w-full max-w-2xl">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="pl-9 pr-10 h-10 md:h-11 w-full bg-background border-muted shadow-sm rounded-xl focus-visible:ring-primary focus-visible:ring-offset-0 transition-all font-medium"
                            placeholder="Search for chats, posts, docs, or people..."
                        />
                        {inputValue && (
                            <button
                                type="button"
                                onClick={() => setInputValue("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </form>
                
                {!isLoading && results.length > 0 && (
                    <p className="text-xs md:text-sm text-muted-foreground ml-1">
                        We found <span className="font-semibold text-foreground">{results.length}</span> matching results
                    </p>
                )}
            </div>

            <ScrollArea className="flex-1">
                <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-3">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="relative">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                <Search className="absolute inset-0 m-auto h-4 w-4 text-primary/50" />
                            </div>
                            <p className="mt-4 text-muted-foreground font-medium">Searching across all records...</p>
                        </div>
                    ) : results.length > 0 ? (
                        results.map((result, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleResultClick(result)}
                                className="group flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border bg-card hover:bg-accent/40 cursor-pointer transition-all duration-200 hover:shadow-md border-transparent hover:border-border"
                            >
                                <div className={cn(
                                    "shrink-0 transition-all duration-200",
                                    result.type === "user" ? "" : "mt-1 p-2 rounded-lg bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
                                )}>
                                    {getIcon(result, "h-5 w-5")}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                            "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors"
                                        )}>
                                            {result.type}
                                        </span>
                                    </div>
                                    <h3 className="text-sm md:text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                        {getHighlightedTitle(result)}
                                    </h3>
                                    <div className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                        {getHighlightedContext(result)}
                                    </div>
                                </div>
                                {isResultPreviewable(result) && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handlePreview(result)
                                        }}
                                        aria-label="Preview attachment"
                                        className="h-8 w-8 md:h-10 md:w-10 rounded-full opacity-0 group-hover:opacity-100 transition-all text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    >
                                        <Eye className="h-5 w-5" />
                                    </Button>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="p-6 rounded-full bg-muted/50 mb-6 transition-transform duration-500 hover:scale-110">
                                <Search className="h-12 w-12 text-muted-foreground opacity-50" />
                            </div>
                            <h2 className="text-base font-semibold text-foreground">No matches found</h2>
                            <p className="mt-2 text-muted-foreground max-w-xs mx-auto">
                                We couldn't find anything matching "{query}". 
                                Try checking for typos or using different keywords.
                            </p>
                            {query && (
                                <Button 
                                    variant="outline" 
                                    className="mt-6 rounded-full"
                                    onClick={() => setInputValue("")}
                                >
                                    Clear Search
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}
