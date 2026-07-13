import { render, fireEvent, screen } from "@testing-library/react-native";
import { Button, Card, Chip, Text } from "../index";

test("Text renders its content", async () => {
  await render(<Text variant="title">Quiet log</Text>);
  expect(screen.getByText("Quiet log")).toBeOnTheScreen();
});

test("Card renders children", async () => {
  await render(
    <Card>
      <Text>Inside a card</Text>
    </Card>,
  );
  expect(screen.getByText("Inside a card")).toBeOnTheScreen();
});

test("Button shows its label and fires onPress", async () => {
  const onPress = jest.fn();
  await render(<Button label="Confirm" onPress={onPress} />);
  await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("Chip exposes its selected state", async () => {
  await render(<Chip label="estimate" selected />);
  expect(screen.getByRole("button", { name: "estimate" })).toBeSelected();
});
