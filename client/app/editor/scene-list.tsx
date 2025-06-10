// "use client"
//
// import {  GripVertical } from "lucide-react"
//
// import { cn } from "@/lib/utils"
// import { Button } from "@/components/ui/button"
//
// // const scenes: string = "" 
//
// export function SceneList() {
//   return (
//     <div className="space-y-1">
//     </div>
//   )
// }
//
// function SceneItem({ scene }: { scene }) {
//   return (
//     <div>
//       <div
//         className={cn(
//           "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50",
//           scene.active && "bg-accent",
//         )}
//       >
//         <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-muted-foreground">
//           <GripVertical className="h-3.5 w-3.5" />
//         </Button>
//         {/* {scene.children ? ( */}
//         {/*   <Button variant="ghost" size="icon" className="h-5 w-5 p-0"> */}
//         {/*     {scene.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} */}
//         {/*   </Button> */}
//         {/* ) : ( */}
//         {/*   <div className="w-5" /> */}
//         {/* )} */}
//         <span className="flex-1 truncate"></span>
//       </div>
//         <div className="ml-6 mt-1 space-y-1">
//         </div>
//     </div>
//   )
// }
