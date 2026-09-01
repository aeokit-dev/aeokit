import type { Project } from "../types";
import { CrawlerTrafficSection } from "../components/CrawlerTrafficSection";
import { PageHeader } from "../components/ui";

export function CrawlerTrafficPage({ project }: { project: Project }) {
  return (
    <div className="page-shell">
      <PageHeader
        title="Identified crawler traffic"
        description={`Declared crawler activity reaching ${project.name}, including live traffic, crawler families, user agents, and daily history.`}
      />
      <CrawlerTrafficSection projectId={project.id} />
    </div>
  );
}
