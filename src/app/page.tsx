import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { getAuthenticatedMember } from "@/lib/auth";

export default async function HomePage() {
  const auth = await getAuthenticatedMember();
  if (auth) {
    if (auth.scope === "platform") {
      redirect("/admin");
    }

    redirect(`/session/${auth.sessionId}`);
  }

  return (
    <main className="minimal-landing">
      <section className="minimal-landing__panel">
        <AccessForm />
      </section>
    </main>
  );
}
