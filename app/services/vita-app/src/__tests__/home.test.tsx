import { render, screen } from "@testing-library/react-native";
import "../i18n";
import Home from "../../app/index";

test("Home renders translated copy", async () => {
  await render(<Home />);
  expect(screen.getByText("Hello")).toBeOnTheScreen();
  expect(screen.getByText("A quiet log of meals, water & movement")).toBeOnTheScreen();
});
