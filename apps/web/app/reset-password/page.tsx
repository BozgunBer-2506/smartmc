import { Suspense } from "react";
import { ResetPasswordForm } from "../../components/ResetPasswordForm";

// useSearchParams (to read ?token=) requires a Suspense boundary in the
// App Router - kept in this thin server component so the client form
// itself stays a plain, simple component.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
