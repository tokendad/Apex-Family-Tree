import React from 'react';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import TreeCanvas from '@/components/TreeCanvas/TreeCanvas';
import CanvasToolbar from '@/components/CanvasToolbar/CanvasToolbar';
import CanvasLegend from '@/components/CanvasLegend/CanvasLegend';
import ContextMenu from '@/components/ContextMenu/ContextMenu';
import DetailPanel from '@/components/DetailPanel/DetailPanel';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTreeData } from '@/hooks/useTreeData';

const TreePage: React.FC = () => {
  useTreeData();
  const { selectedPersonId } = useCanvasStore();

  return (
    <AppShell
      navbar={<Navbar />}
      sidebar={<Sidebar />}
      detail={<DetailPanel />}
      showDetail={selectedPersonId !== null}
    >
      <CanvasToolbar />
      <TreeCanvas />
      <CanvasLegend />
      <ContextMenu />
    </AppShell>
  );
};

export default TreePage;
