import { NextResponse } from "next/server"
import { trelloService, mapStatusToTrelloList } from "@/lib/services/trello-service"
import { taskService, type Task } from "@/lib/services/task-service"

export async function GET() {
  try {
    // Trelloのリストを取得
    const lists = await trelloService.getLists()

    // 各リストのカードを取得してタスクに変換
    const tasks: Task[] = []

    for (const list of lists) {
      try {
        const cards = await trelloService.getCards(list.id)

        for (const card of cards) {
          const task = trelloService.mapTrelloCardToTask(card, list.name) as Task
          tasks.push(task)
        }
      } catch (cardError) {
        console.error(`Error fetching cards for list ${list.id}:`, cardError)
        // 個別のリストのエラーは無視して続行
      }
    }

    return NextResponse.json({ success: true, tasks })
  } catch (error) {
    console.error("Error syncing with Trello:", error)
    // エラーメッセージを安全に抽出
    const errorMessage =
      error && typeof error === "object" && "message" in error ? String(error.message) : "Failed to sync with Trello"

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { task } = await request.json()

    if (!task || !task.status) {
      return NextResponse.json({ success: false, error: "Invalid task data" }, { status: 400 })
    }

    // タスクのステータスに対応するTrelloリストを取得
    const listName = mapStatusToTrelloList(task.status)
    const lists = await trelloService.getLists()
    const targetList = lists.find((list) => list.name === listName)

    if (!targetList) {
      return NextResponse.json({ success: false, error: "Target Trello list not found" }, { status: 400 })
    }

    // Trelloカードを作成
    const card = await trelloService.createCard(targetList.id, {
      name: task.title || "Untitled Task",
      desc: task.description || "",
      due: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
    })

    // 作成されたカードのIDをタスクに追加して保存
    const updatedTask = { ...task, trelloCardId: card.id } as Task
    if (task.id) {
      await taskService.updateTask(task.id, { trelloCardId: card.id })
    }

    return NextResponse.json({ success: true, task: updatedTask })
  } catch (error) {
    console.error("Error creating Trello card:", error)
    // エラーメッセージを安全に抽出
    const errorMessage =
      error && typeof error === "object" && "message" in error ? String(error.message) : "Failed to create Trello card"

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

