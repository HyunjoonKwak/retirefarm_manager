export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="flex h-14 items-center justify-between px-4 text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} RetireFarm Manager. All rights reserved.</p>
        <p>v1.0.0</p>
      </div>
    </footer>
  );
}
