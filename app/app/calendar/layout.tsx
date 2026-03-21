export default function CalendarLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col h-full bg-background relative w-full overflow-hidden">
            {children}
        </div>
    );
}
