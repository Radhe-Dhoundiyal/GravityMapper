import { useToast } from "@/hooks/use-toast"
import { ToastContainer, Toast } from "@/components/ui/toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <ToastContainer>
      {toasts.map(function ({ id, type, title, description }) {
        // Convert to string safely, handling React nodes
        const message = (description || title) 
          ? typeof description === 'string' 
            ? description 
            : typeof title === 'string' 
              ? title 
              : "Notification"
          : "Notification";
          
        return (
          <Toast 
            key={id} 
            id={id}
            type={type || "info"}
            message={message}
            onDismiss={dismiss}
          />
        )
      })}
    </ToastContainer>
  )
}
