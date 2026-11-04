interface Props {
  title: string;
  accent: string;
  description: string;
}

export function PlaceholderPage({ title, accent, description }: Props) {
  return (
    <div>
      <div className="page-hdr">
        <h2>
          {title} <em>{accent}</em>
        </h2>
        <p>{description}</p>
      </div>
      <div className="panel panel-clip placeholder-panel">
        Bu ekran sonraki adımlarda eski uygulamadan taşınacak.
      </div>
    </div>
  );
}