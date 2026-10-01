/** 资源类型（客户端安全模块：不含 Node 依赖，可被前端组件直接 import） */
export type ResType = "student" | "teacher" | "resource" | "thematic"

/** 旧数据缺省 res_type 时按学生教材处理 */
export function resTypeOf(b: Pick<{ res_type?: ResType }, "res_type">): ResType {
  return b.res_type ?? "student"
}
