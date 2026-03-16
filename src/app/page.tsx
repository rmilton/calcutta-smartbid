import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { AppFooter } from "@/components/app-footer";
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
      <div className="minimal-landing__content">
        <section className="minimal-landing__panel">
          <AccessForm />
        </section>
        <AppFooter className="minimal-landing__footer" />
      </div>
    </main>
  );
}
