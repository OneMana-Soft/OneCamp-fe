import { takes } from "./takes"

await takes(800)

export default function Inner() {
  return <p>inner</p>
}
