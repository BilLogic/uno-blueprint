// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TranscriptRow } from "@/components/editor/agent/TranscriptRow";
import { REPEAT_READ_SUPPRESSED } from "@/lib/agent/tools/refusals";

/*
 * A tool row says how the call went. A repeat the loop declined to run went
 * as designed — the turn is behaving — so it must not wear the colour a
 * reader scans for when hunting the call that broke.
 */

afterEach(cleanup);

const rowOf = (name: string) =>
  screen.getByText(name).closest("button") as HTMLElement;

describe("a tool row", () => {
  it("renders a suppressed repeat muted, not as an error", () => {
    render(
      <TranscriptRow
        event={{
          kind: "tool",
          name: "list_blueprint",
          summary: REPEAT_READ_SUPPRESSED,
          isError: false,
          suppressed: true,
          args: "{}",
          result: "Already run this turn.",
        }}
      />
    );
    const row = rowOf("list_blueprint");
    expect(row.className).not.toMatch(/text-destructive/);
    expect(row.className).toMatch(/text-muted-foreground/);
    expect(row.querySelector(".lucide-circle-x, .lucide-x-circle")).toBeNull();
    // Nor does it claim the call ran: the success check is for calls that did.
    expect(
      row.querySelector(".lucide-circle-check, .lucide-check-circle-2")
    ).toBeNull();
    expect(screen.getByText(REPEAT_READ_SUPPRESSED)).toBeTruthy();
  });

  it("still renders a genuine failure as an error", () => {
    render(
      <TranscriptRow
        event={{
          kind: "tool",
          name: "update_cell",
          summary: "cell not found",
          isError: true,
          args: "{}",
          result: "Error: cell not found",
        }}
      />
    );
    const row = rowOf("update_cell");
    expect(row.className).toMatch(/text-destructive/);
    expect(row.querySelector(".lucide-circle-x, .lucide-x-circle")).not.toBeNull();
  });
});
