import { useNavigate } from 'react-router-dom'
import { PreplanForm } from '../components/PreplanForm'

export function AddScreen() {
  const navigate = useNavigate()
  return (
    <PreplanForm
      mode="create"
      onSaved={(preplan) => navigate(`/preplan/${preplan.id}`)}
      onCancel={() => navigate('/search')}
    />
  )
}
