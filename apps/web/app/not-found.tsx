import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-extrabold text-primary">404</p>
      <h1 className="mt-2 text-xl font-bold text-slate-800">Page not found</h1>
      <p className="mt-1 text-slate-500">The page you’re looking for doesn’t exist.</p>
      <Link href="/" className="btn-primary mt-6">
        Back to Home
      </Link>
    </div>
  );
}
