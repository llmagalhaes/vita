import { Pressable, Text as RNText } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../i18n";
import { VoiceOverlay } from "../capture/VoiceOverlay";
import { useVoiceCapture } from "../capture/useVoiceCapture";
import type { RecognizerHandlers, SpeechRecognizer } from "../capture/speech";

/** Controllable fake so tests can drive partials/final/error deterministically. */
function makeFake(opts: { permission?: "granted" | "denied" | "unavailable"; available?: boolean } = {}) {
  let h: RecognizerHandlers | null = null;
  const calls = { started: false, stopped: false, aborted: false };
  const rec: SpeechRecognizer = {
    isAvailable: () => opts.available ?? true,
    requestPermission: async () => opts.permission ?? "granted",
    start: (handlers) => {
      h = handlers;
      calls.started = true;
    },
    stop: () => {
      calls.stopped = true;
    },
    abort: () => {
      calls.aborted = true;
    },
  };
  return {
    rec,
    calls,
    emitPartial: (t: string) => h?.onPartial(t),
    emitFinal: (t: string) => h?.onFinal(t),
    emitError: () => h?.onError("boom"),
  };
}

/** Host that surfaces hook state as text and exposes the gesture callbacks as buttons. */
function Host({ rec, onFinal }: { rec: SpeechRecognizer; onFinal: (t: string) => void }) {
  const v = useVoiceCapture(onFinal, rec);
  return (
    <>
      <RNText>{`status:${v.status}`}</RNText>
      <RNText>{`transcript:${v.transcript}`}</RNText>
      <RNText>{`cancel:${v.willCancel}`}</RNText>
      <Pressable accessibilityLabel="start" onPress={() => void v.holdStart()} />
      <Pressable accessibilityLabel="move" onPress={() => v.holdMove(-200)} />
      <Pressable accessibilityLabel="end" onPress={() => v.holdEnd()} />
      <Pressable accessibilityLabel="dismiss" onPress={() => v.dismiss()} />
    </>
  );
}

describe("useVoiceCapture state machine", () => {
  test("hold → listening → partial → release → transcribing → final submits", async () => {
    const fake = makeFake();
    const onFinal = jest.fn();
    await render(<Host rec={fake.rec} onFinal={onFinal} />);

    expect(screen.getByText("status:idle")).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText("start"));
    await waitFor(() => expect(screen.getByText("status:listening")).toBeOnTheScreen());
    expect(fake.calls.started).toBe(true);

    await act(async () => fake.emitPartial("had a banana"));
    expect(screen.getByText("transcript:had a banana")).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText("end"));
    expect(screen.getByText("status:transcribing")).toBeOnTheScreen();
    expect(fake.calls.stopped).toBe(true);

    await act(async () => fake.emitFinal("had a banana"));
    expect(onFinal).toHaveBeenCalledWith("had a banana");
    expect(screen.getByText("status:idle")).toBeOnTheScreen();
  });

  test("slide up past threshold then release cancels — no submit", async () => {
    const fake = makeFake();
    const onFinal = jest.fn();
    await render(<Host rec={fake.rec} onFinal={onFinal} />);

    await fireEvent.press(screen.getByLabelText("start"));
    await waitFor(() => expect(screen.getByText("status:listening")).toBeOnTheScreen());

    await fireEvent.press(screen.getByLabelText("move"));
    expect(screen.getByText("cancel:true")).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText("end"));
    expect(fake.calls.aborted).toBe(true);
    expect(onFinal).not.toHaveBeenCalled();
    expect(screen.getByText("status:idle")).toBeOnTheScreen();
  });

  test("permission denied → denied state, recognizer never starts", async () => {
    const fake = makeFake({ permission: "denied" });
    await render(<Host rec={fake.rec} onFinal={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText("start"));
    await waitFor(() => expect(screen.getByText("status:denied")).toBeOnTheScreen());
    expect(fake.calls.started).toBe(false);
  });

  test("engine unavailable → unavailable state", async () => {
    const fake = makeFake({ available: false });
    await render(<Host rec={fake.rec} onFinal={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText("start"));
    await waitFor(() => expect(screen.getByText("status:unavailable")).toBeOnTheScreen());
  });

  test("recognizer error surfaces as error state", async () => {
    const fake = makeFake();
    await render(<Host rec={fake.rec} onFinal={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText("start"));
    await waitFor(() => expect(screen.getByText("status:listening")).toBeOnTheScreen());
    await act(async () => fake.emitError());
    expect(screen.getByText("status:error")).toBeOnTheScreen();
  });

  test("dismiss returns to idle and aborts", async () => {
    const fake = makeFake();
    await render(<Host rec={fake.rec} onFinal={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText("start"));
    await waitFor(() => expect(screen.getByText("status:listening")).toBeOnTheScreen());
    await fireEvent.press(screen.getByLabelText("dismiss"));
    expect(screen.getByText("status:idle")).toBeOnTheScreen();
    expect(fake.calls.aborted).toBe(true);
  });
});

describe("VoiceOverlay rendering per state", () => {
  const base = { transcript: "", willCancel: false, onTypeInstead: jest.fn(), onDismiss: jest.fn() };

  test("idle renders nothing", async () => {
    await render(<VoiceOverlay status="idle" {...base} />);
    expect(screen.queryByText("Type instead")).toBeNull();
  });

  test("listening shows transcript and cancel hint", async () => {
    await render(<VoiceOverlay status="listening" {...base} transcript="had eggs" />);
    expect(screen.getByText("had eggs")).toBeOnTheScreen();
    expect(screen.getByText("Slide up to cancel")).toBeOnTheScreen();
  });

  test("listening + willCancel warns release-to-cancel", async () => {
    await render(<VoiceOverlay status="listening" {...base} willCancel />);
    expect(screen.getByText("Release to cancel")).toBeOnTheScreen();
  });

  test("transcribing shows calm wait copy", async () => {
    await render(<VoiceOverlay status="transcribing" {...base} />);
    expect(screen.getByText("Just a moment…")).toBeOnTheScreen();
  });

  test("denied offers type-instead fallback", async () => {
    await render(<VoiceOverlay status="denied" {...base} />);
    expect(screen.getByText(/needs the microphone/)).toBeOnTheScreen();
    expect(screen.getByText("Type instead")).toBeOnTheScreen();
  });

  test("unavailable offers type-instead fallback", async () => {
    await render(<VoiceOverlay status="unavailable" {...base} />);
    expect(screen.getByText(/isn't available/)).toBeOnTheScreen();
    expect(screen.getByText("Type instead")).toBeOnTheScreen();
  });

  test("error offers type-instead fallback", async () => {
    await render(<VoiceOverlay status="error" {...base} />);
    expect(screen.getByText(/didn't catch that/)).toBeOnTheScreen();
  });
});

describe("stub recognizer streams a demo phrase", () => {
  test("final equals what was streamed", () => {
    jest.useFakeTimers();
    const { stubRecognizer } = require("../capture/speech");
    const rec = stubRecognizer("one two three");
    const partials: string[] = [];
    let final = "";
    rec.start({ onPartial: (t: string) => partials.push(t), onFinal: (t: string) => (final = t), onError: () => {} });
    jest.advanceTimersByTime(1000);
    rec.stop();
    jest.advanceTimersByTime(1);
    expect(partials[partials.length - 1]).toBe("one two three");
    expect(final).toBe("one two three");
    jest.useRealTimers();
  });
});
