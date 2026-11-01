import { takes } from "./takes"

await takes(1500)

export default function Slow() {
  return <p>arrived</p>
}
