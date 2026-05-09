import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Table } from "../components/Table";

const frankingsColumns = [
  "Rank",
  "Team",
  "Total",
  "R",
  "HR",
  "RBI",
  "SB",
  "OBP",
  "W",
  "SV",
  "K",
  "ERA",
  "WHIP",
  "Change",
];

const frankings = [
  { Rank: 1, Team: "La Bombe", Total: 96.83, R: 9.5, HR: 12, RBI: 12, SB: 4.33, OBP: 7, W: 11.5, SV: 5.5, K: 11, ERA: 12, WHIP: 12, Change: "0.00" },
  { Rank: 2, Team: "J Curt Rises ✝️", Total: 96, R: 9.5, HR: 10, RBI: 9, SB: 10, OBP: 10, W: 10, SV: 8.5, K: 7, ERA: 11, WHIP: 11, Change: "+1.50" },
  { Rank: 3, Team: "Drew Crew", Total: 83.83, R: 12, HR: 4.5, RBI: 7, SB: 9, OBP: 12, W: 4.33, SV: 10, K: 5, ERA: 10, WHIP: 10, Change: "+2.83" },
  { Rank: 4, Team: "👸🏼🍑Principesca🍑👸🏼", Total: 70, R: 8, HR: 9, RBI: 10.5, SB: 6, OBP: 8, W: 6.5, SV: 11, K: 2, ERA: 6, WHIP: 3, Change: "-1.83" },
  { Rank: 5, Team: "The Giant Sticks", Total: 66.33, R: 6.5, HR: 3, RBI: 8, SB: 12, OBP: 6, W: 4.33, SV: 3.5, K: 9, ERA: 7, WHIP: 7, Change: "+3.00" },
  { Rank: 6, Team: "Pawtucket Finger Blasters", Total: 65, R: 11, HR: 7.5, RBI: 3.5, SB: 1, OBP: 11, W: 6.5, SV: 3.5, K: 4, ERA: 9, WHIP: 8, Change: "+4.00" },
  { Rank: 7, Team: "The Dotta's Don", Total: 65, R: 6.5, HR: 6, RBI: 5.5, SB: 7, OBP: 9, W: 8.5, SV: 5.5, K: 6, ERA: 2, WHIP: 9, Change: "-4.00" },
  { Rank: 8, Team: "HAMMYTEX", Total: 53.5, R: 1, HR: 2, RBI: 3.5, SB: 8, OBP: 3, W: 11.5, SV: 1.5, K: 12, ERA: 5, WHIP: 6, Change: "-1.33" },
  { Rank: 9, Team: "Ⓜ️&Ⓜ️ Enterprise", Total: 51.83, R: 4, HR: 11, RBI: 5.5, SB: 4.33, OBP: 5, W: 8.5, SV: 1.5, K: 10, ERA: 1, WHIP: 1, Change: "-7.00" },
  { Rank: 10, Team: "🦅Las Aguilas🦅", Total: 47.83, R: 3, HR: 4.5, RBI: 2, SB: 11, OBP: 1, W: 4.33, SV: 7, K: 8, ERA: 3, WHIP: 4, Change: "+0.50" },
  { Rank: 11, Team: "Scruva", Total: 45.5, R: 2, HR: 7.5, RBI: 10.5, SB: 2, OBP: 4, W: 2, SV: 8.5, K: 3, ERA: 4, WHIP: 2, Change: "+3.50" },
  { Rank: 12, Team: "Grand Hustle", Total: 40.33, R: 5, HR: 1, RBI: 1, SB: 4.33, OBP: 2, W: 1, SV: 12, K: 1, ERA: 8, WHIP: 5, Change: "-1.17" },
];

const meta = {
  title: "Components/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Frankings: Story = {
  args: {
    columns: frankingsColumns,
    data: frankings,
    defaultSortCol: 3,
    doNotSortCol: 1
  },
};
