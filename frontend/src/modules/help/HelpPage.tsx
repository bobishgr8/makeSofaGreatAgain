import { Link } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { useFormConfig } from "../../app/FormConfigContext";
import Card from "../../common/components/Card";
import { whatsappLink } from "../../common/notifications";
import "../../common/styles/pages.css";

type Topic = { question: string; answer: string };

// EPIC 13: help for donors, social workers and admins, with a direct WhatsApp
// chat to the team (HELP_WHATSAPP on the backend).
const TOPICS: Record<"donor" | "social_worker" | "admin" | "guest", Topic[]> = {
  guest: [
    {
      question: "How do I donate furniture?",
      answer:
        "Create a free account, then fill in the donation form with photos and a collect-by date at least 3 days away. Our team reviews every listing before social workers can see it.",
    },
    {
      question: "Who receives the furniture?",
      answer:
        "Families and community members supported by social workers from partner organisations. Social workers request items for the households they work with.",
    },
  ],
  donor: [
    {
      question: "When will my donation be matched?",
      answer:
        "Once approved, your item is suggested to social workers whose households need it. We message you on WhatsApp as soon as one requests it.",
    },
    {
      question: "What happens after a match?",
      answer:
        "Connect with the social worker on WhatsApp within 5 days, agree on the delivery, then choose a logistics service in the app. You cover the delivery cost.",
    },
    {
      question: "Can I change or cancel my donation?",
      answer:
        "You can edit or cancel it until it is matched. After that you can find another match or cancel the match from your donation's page.",
    },
  ],
  social_worker: [
    {
      question: "How do I find furniture for a household?",
      answer:
        "Create a case with what the household needs, then open its suggested matches. Request an available item, or join the waitlist for one already requested.",
    },
    {
      question: "How does the waitlist work?",
      answer:
        "If a requested item becomes free again, the first case in line is matched automatically and we let you know on WhatsApp. Waitlist requests close after 30 days.",
    },
    {
      question: "What do I do after the delivery?",
      answer:
        "Mark the delivery complete, then pass on a short thank-you note from the household. It means a lot to donors.",
    },
  ],
  admin: [
    {
      question: "Reviewing listings and accounts",
      answer:
        "Approve or reject new listings and social worker accounts from the Admin page. Approved social workers are let in the next time they open the app.",
    },
    {
      question: "Something is stuck",
      answer:
        "Admins can release a match from the Admin page. Background jobs (expiring matches and waitlists, sending WhatsApp messages) run from backend/scripts/scheduler.py.",
    },
  ],
};

export default function HelpPage() {
  const { role } = useAuth();
  const { helpWhatsapp } = useFormConfig();
  const topics = TOPICS[role ?? "guest"];

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Help</p>
          <h1>
            We&rsquo;re here to <span className="page-underline">help</span>
          </h1>
          <p>Answers to common questions, or a chat with our team on WhatsApp.</p>
        </div>
      </div>

      <aside className="page-callout">
        <strong>Chat with us on WhatsApp</strong>
        {helpWhatsapp ? (
          <>
            <p>A real person from the Refurbish team will get back to you.</p>
            <p>
              <a
                className="button"
                href={whatsappLink(helpWhatsapp, "Hi Refurbish, I need some help with ")}
                target="_blank"
                rel="noreferrer"
              >
                Open WhatsApp chat
              </a>
            </p>
          </>
        ) : (
          <p>Our help line is being set up. In the meantime, your social worker or our team can be reached through your partner organisation.</p>
        )}
      </aside>

      <div className="page-stack help-topics">
        {topics.map((topic) => (
          <Card key={topic.question}>
            <h3>{topic.question}</h3>
            <p>{topic.answer}</p>
          </Card>
        ))}
      </div>

      {!role && (
        <p className="muted-text" style={{ marginTop: 32 }}>
          Ready to give? <Link to="/donate">Donate furniture</Link>
        </p>
      )}
    </main>
  );
}
