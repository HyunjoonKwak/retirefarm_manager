interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function PageContainer({ children, title, description }: PageContainerProps) {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      {(title || description) && (
        <div className="space-y-1">
          {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
