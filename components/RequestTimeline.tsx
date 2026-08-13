import { formatDate } from "@/components/ui";
import { S } from "@/lib/strings";

/**
 * Request lifecycle stepper — makes the state machine visible.
 *
 * Pure presentation: the row already carries created_at / assigned_at /
 * completed_at / rated_at / cancelled_at, so this surfaces the "one timestamp
 * per reached state" design decision (arch §4.1) with no query change.
 *
 * RTL: the rail reads right-to-left, so the earliest step sits on the right and
 * the connector between nodes fills leftward as the request progresses.
 */

type TimelineRequest = {
  status: string;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  rated_at: string | null;
  cancelled_at: string | null;
};

type Step = { key: string; at: string | null; reached: boolean };

/** The normal five-state path; the current node is the last reached one. */
function normalSteps(r: TimelineRequest): Step[] {
  const order = ["open", "has_offers", "assigned", "completed", "rated"];
  const reachedIdx = order.indexOf(r.status);
  const at: Record<string, string | null> = {
    open: r.created_at,
    // has_offers has no dedicated timestamp — it's a transient browsing state;
    // show it as reached (no date) once the request moved past open.
    has_offers: null,
    assigned: r.assigned_at,
    completed: r.completed_at,
    rated: r.rated_at,
  };
  return order.map((key, i) => ({
    key,
    at: at[key],
    reached: i <= reachedIdx,
  }));
}

export function RequestTimeline({ request }: { request: TimelineRequest }) {
  // A cancelled request tells a two-node story: it was published, then cancelled.
  const cancelled = request.status === "cancelled";
  const steps: Step[] = cancelled
    ? [
        { key: "open", at: request.created_at, reached: true },
        { key: "cancelled", at: request.cancelled_at, reached: true },
      ]
    : normalSteps(request);

  return (
    <section aria-label={S.timeline.title}>
      <h2 className="mb-3 text-sm font-bold text-label">{S.timeline.title}</h2>
      <ol className="flex items-start">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const isCurrent =
            step.reached && (isLast || !steps[i + 1].reached);
          return (
            <li
              key={step.key}
              className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
            >
              {/* Connector to the NEXT node. In RTL the next node is to the
                  left, so the bar extends from this node's center leftward. */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute end-1/2 top-2.5 h-0.5 w-full ${
                    steps[i + 1].reached ? "bg-brand" : "bg-line"
                  }`}
                />
              )}
              <span
                aria-hidden
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  step.key === "cancelled"
                    ? "bg-red-500 text-white"
                    : step.reached
                      ? "bg-brand text-white"
                      : "border-2 border-line bg-white text-muted"
                } ${isCurrent ? "ring-4 ring-brand/20" : ""}`}
              >
                {step.reached ? (step.key === "cancelled" ? "✕" : "✓") : ""}
              </span>
              <span
                className={`text-[11px] font-semibold leading-tight ${
                  step.reached ? "text-ink" : "text-muted"
                }`}
              >
                {S.timeline.steps[step.key]}
              </span>
              {step.at && (
                <span className="text-[10px] text-muted">
                  {formatDate(step.at)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
