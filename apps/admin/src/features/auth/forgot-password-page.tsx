import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6f7] px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold text-accent">Impact Academy</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Password help</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Email-based password recovery is not configured for this academy yet. Contact your
          academy administrator to restore access.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
